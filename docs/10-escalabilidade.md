# 10 — Escalabilidade

Filosofia: **arquitetar para 1 milhão, construir para 10 mil.** As decisões de base (cursor pagination, índices parciais, ISR, eventos separados de agregados, tabela de eventos particionável) já suportam escala; os upgrades abaixo são acionados por gatilhos medidos, nunca especulativamente.

## Por ordem de grandeza

### 100 – 1.000 vagas (MVP)
Nada especial. Facet counts calculados ao vivo (índices cobrem), `count(*)` real na listagem, ISR 60s. Postgres free tier (500 MB) usa < 50 MB. P95 esperado da homepage: < 150ms de query.

### 10.000 vagas
Gatilho: P95 da homepage > 300ms OU CPU do banco > 50% sustentado.
- Ativar **`mv_facet_counts`** (materialized view, refresh concurrently 15 min via pg_cron) para contagens de filtros.
- Trocar `count(*)` por estimativa (`reltuples` ajustada pelos filtros ou count com `LIMIT 1000` + "1.000+").
- `job_events` cresce ~50k linhas/mês → ainda trivial; conferir eficácia do BRIN.
- Sitemap paginado em chunks (já previsto).

### 100.000 vagas
Gatilhos: storage > 60% do plano, rollup noturno > 5 min, busca > 500ms.
- **Particionar `job_events` por mês** (partição declarativa; poda de 90 dias vira `DROP PARTITION` — instantâneo).
- Índice composto adicional orientado por `pg_stat_statements` (habilitar e revisar trimestralmente).
- Considerar upgrade do Supabase (Pro) — primeiro custo real do projeto; alternativa documentada: qualquer Postgres gerenciado (o projeto não usa nada proprietário além de Auth).
- `generateStaticParams` limitado às 5.000 vagas mais recentes; resto on-demand ISR (já é o desenho).
- Arquivadas antigas (> 1 ano): mover `description_md` para coluna comprimida ou tabela `jobs_archive_content` (acesso raro, página continua funcionando).

### 1.000.000 de vagas
Neste ponto o produto mudou de natureza (agregador nacional). Upgrades honestos:
- **Busca**: tsvector + GIN aguenta, mas relevância vira diferencial → avaliar extensão `pgroonga`/`pg_search` (BM25) no próprio Postgres antes de qualquer serviço externo (Meilisearch/Typesense como opção final — nunca Elasticsearch, custo/complexidade injustificáveis aqui).
- **Réplica de leitura** (Supabase suporta) para separar tráfego público de admin/rollups.
- Homepage filtrada: cache de combinações quentes de filtro (KV da Vercel ou `unstable_cache` com tags por taxonomia).
- CDN absorve o resto: páginas de vaga são ISR — o banco só vê misses.

## Gargalos previstos e por que não nos afetam cedo

| Gargalo clássico | Nossa defesa desde o dia 1 |
|---|---|
| OFFSET pagination degrada | cursor keyset em tudo |
| COUNT(*) em tabela grande | estimativas + facet MV |
| Tabela de eventos infinita | agregados diários + poda + BRIN + partição planejada |
| Cold start serverless | Drizzle (leve), sem Prisma engine; rotas quentes ficam quentes na Vercel |
| Conexões Postgres esgotadas | Supavisor transaction pooling (pool compartilhado entre functions) |
| Invalidação de cache | `revalidateTag` cirúrgico (`jobs`, `job:{slug}`) em vez de purge global |
| IA como gargalo de custo/latência | importação é assíncrona do ponto de vista do visitante; orçamento mensal com corte |

## O que nunca faremos (anti-metas registradas)

Microserviços, Kubernetes, fila externa antes da fila-em-Postgres saturar (> 10 imports/min sustentados), GraphQL, cache Redis antes de medir, multi-região de banco. Cada um teria de nascer de um ADR com números.
