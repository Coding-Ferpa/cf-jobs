# 13 — Roadmap

Prioridade guiada por: **valor para o membro da comunidade primeiro, esforço do curador segundo, expansão de audiência depois.** Cada fase tem critério de pronto (DoD) mensurável; nenhuma fase começa sem a anterior em produção.

## Fase 1 — MVP (fundação + área pública + admin manual) `[Concluído]`
**Meta: vagas no ar, bonitas e indexáveis, mesmo que cadastradas com ajuda manual.**
- [x] Repo, CI/CD, banco completo (migrations 0001–0009 + RLS + seeds), auth com papéis (admin, editor, moderator, reader).
- [x] Área pública: home com busca/filtros/paginação via cursor, página da vaga, SEO/OG/JSON-LD completos, compartilhamento, tema dark/light.
- [x] Admin: CRUD de vagas (formulário manual), CRUD de taxonomias e empresas, arquivamento automático (pg_cron).
- [x] Analytics first-party (views/cliques com hashing de visitante) + dashboard (totais, séries temporais, top vagas, saúde).
- **DoD**: Lighthouse budgets verdes; 20 vagas reais publicadas; vaga aparece no Google em < 7 dias; setup de contribuidor < 10 min comprovado por alguém de fora.

## Fase 2 — Importação automática por IA (diferencial do produto) `[Concluído]`
**Meta: cadastrar vaga = colar URL.**
- [x] `safe-fetch` anti-SSRF + adapters (Greenhouse, Lever, Ashby, Gupy, genérico JSON-LD/Readability/Turndown).
- [x] Integração NVIDIA NIM (prompt canônico, response_format com Zod, retries, chave dupla, cascata de 3 modelos, orçamento de tokens).
- [x] Tela de importação com progresso em segundo plano + tela de revisão; fila de sugestões de taxonomia.
- [x] Observabilidade de importação e custos no dashboard; importação em lote (fila em Postgres + cron).
- **DoD**: ≥ 85% das URLs dos ATSs importam sem edição manual de campos estruturados; tempo médio < 20s; zero vagas publicadas sem revisão humana.

## Fase 3 — Analytics avançado `[Parcial — ~60%]`
- [x] Infraestrutura first-party completa: beacon anonimizado (`job_events`), dedup diário, agregação periódica em `v_daily_metrics` e painéis de audiência/saúde no admin.
- [ ] PostHog (funis busca→clique adicionais, opcional via env).
- [ ] Relatório mensal automático para a comunidade (post no Discord).
- [ ] `mv_facet_counts` se gatilhos de escala dispararem.
- **DoD**: dashboard responde "quais tecnologias a comunidade mais busca?" com dados de 30 dias.

## Fase 4 — Perfis públicos de devs `[Não iniciado]`
- [ ] Perfil opt-in (nome, stack, senioridade, links, "aberto a propostas").
- [ ] Página `/devs`.
- [ ] Controle total de privacidade (LGPD: consentimento explícito, exclusão self-service).
- [ ] Reuso de `profiles` + novas tabelas `dev_profiles`, `dev_technologies`.
- **DoD**: 30 perfis criados por membros.

## Fase 5 — Recrutadores publicam vagas `[Não iniciado]`
- [ ] Papel `recruiter`.
- [ ] Fluxo de submissão (mesma tela de revisão da IA — recrutador cola URL ou preenche).
- [ ] Moderação obrigatória.
- [ ] Página da empresa reivindicável.
- [ ] Antispam: aprovação manual de contas recruiter.
- **DoD**: 5 empresas publicando diretamente.

## Fase 6 — Aplicação pela plataforma `[Não iniciado]`
- [ ] "Candidatar-se com perfil CF Jobs" (envia perfil ao recrutador).
- [ ] Tracking de candidaturas do lado do dev.
- *Nota*: Só faz sentido com massa crítica das fases 4–5.

## Fase 7 — Recomendação por IA e Busca Semântica Híbrida `[Não iniciado]`
- [ ] **Fila de Embeddings de Vagas**:
  - Geração assíncrona de embeddings a cada nova vaga publicada (enfileiramento em Postgres + worker/cron).
  - Modelo leve: `gte-small` (ou equivalente via NIM / HuggingFace).
  - Payload enxuto e sem ruído: gera embedding **apenas sobre keywords e metadados estruturados** (`title`, `company`, `role`, `seniority`, `technologies`, `keywords`), **sem a `description` longa**.
  - Persistência e indexação vetorial via extensão `pgvector` (índice HNSW/IVFFlat na tabela `jobs` ou `job_embeddings`).
- [ ] **Busca Híbrida**: fusão de ranking (RRF - Reciprocal Rank Fusion) entre Full-Text Search GIN (`tsvector`) e similaridade de cosseno (`pgvector`).
- [ ] **Matching perfil × vaga**: alertas e recomendações personalizadas opt-in via e-mail ou Discord DM.
- *Nota*: A extensão `pgvector` já é suportada nativamente no Supabase — sem necessidade de infraestrutura ou banco vetorial externo.

## Fase 8 — Integração Discord e Canais de Comunidade (Broadcast) `[Em progresso — ~40%]`
- [x] API pública v1 completa (`/api/v1/jobs`, `/api/v1/taxonomies`, `/api/v1/events`, OpenAPI 3.1 + Docs Scalar).
- [x] Subsistema agnóstico de divulgação (ADR-0020): contrato `BroadcastProvider` e catálogo desacoplado (`AVAILABLE_CHANNELS`).
- [x] Provedor Meta WhatsApp Cloud API: envio automatizado para grupos (suporte a grupo de teste e grupo de produção), formatação Markdown e toggle de desativação na tela de cadastro.
- [x] Webhook do WhatsApp (`/api/webhooks/whatsapp`) para handshake e confirmações de status da mensagem.
- [ ] Provedor Discord (envio de webhook em canais de vagas).
- [ ] Provedor Telegram (envio para canal/grupo).
- [ ] Bot interativo da comunidade para consultas (`/vagas react pleno`).
- [ ] Webhook assinado de novas vagas para terceiros.

## Fase 9 — Integração LinkedIn `[Não iniciado]`
- [ ] Auto-post de vagas selecionadas na página da comunidade (API oficial de compartilhamento; nunca scraping).
- [ ] Import de perfil LinkedIn para a Fase 4 via export do usuário (não API não-oficial).

## Fase 10 — Marketplace da comunidade `[Não iniciado]`
- [ ] Freelas/projetos entre membros.
- *Nota*: Reavaliar tudo ao chegar aqui — provavelmente um produto irmão reutilizando auth, design system e reputação.

## Riscos transversais monitorados

| Risco | Mitigação |
|---|---|
| Curadoria vira gargalo (1 admin) | Fase 2 reduz custo por vaga a ~1 min; papel editor distribuído a membros de confiança |
| ATSs mudam formato | adapters isolados + fixtures = correção pontual; fallback genérico sempre existe |
| Free tiers mudarem de política | nada proprietário além do Supabase Auth; ADRs documentam portabilidade |
| Comunidade não adota | Fase 8 (Discord, onde a comunidade vive) é antídoto — pode ser antecipada se o tráfego orgânico decepcionar |
