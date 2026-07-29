# 13 — Roadmap

Prioridade guiada por: **valor para o membro da comunidade primeiro, esforço do curador segundo, expansão de audiência depois.** Cada fase tem critério de pronto (DoD) mensurável; nenhuma fase começa sem a anterior em produção.

## Fase 1 — MVP (fundação + área pública + admin manual)
**Meta: vagas no ar, bonitas e indexáveis, mesmo que cadastradas com ajuda manual.**
- Repo, CI/CD, banco completo (migrations + RLS + seeds), auth com papéis.
- Área pública: home com busca/filtros/paginação, página da vaga, SEO/OG/JSON-LD completos, compartilhamento, tema dark/light.
- Admin: CRUD de vagas (formulário manual), CRUD de taxonomias, arquivamento automático (pg_cron).
- Analytics first-party (views/cliques) + dashboard básico (totais, top vagas).
- **DoD**: Lighthouse budgets verdes; 20 vagas reais publicadas; vaga aparece no Google em < 7 dias; setup de contribuidor < 10 min comprovado por alguém de fora.

## Fase 2 — Importação automática por IA (diferencial do produto)
**Meta: cadastrar vaga = colar URL.**
- `safe-fetch` + adapters (Greenhouse, Lever, Ashby, Gupy, genérico JSON-LD/Readability).
- Integração NVIDIA NIM (prompt, guided_json, Zod, retries, fallbacks, orçamento).
- Tela de importação com progresso + tela de revisão; fila de sugestões de taxonomia.
- Observabilidade de importação no dashboard; importação em lote (fila em Postgres + cron).
- **DoD**: ≥ 85% das URLs dos 6 ATSs importam sem edição manual de campos estruturados; tempo médio < 20s; zero vagas publicadas sem revisão humana.

## Fase 3 — Analytics avançado
PostHog (funis busca→clique), origem de tráfego detalhada, relatório mensal automático para a comunidade (post no Discord), mv_facet_counts se gatilhos de escala dispararem. **DoD**: dashboard responde "quais tecnologias a comunidade mais busca?" com dados de 30 dias.

## Fase 4 — Perfis públicos de devs
Perfil opt-in (nome, stack, senioridade, links, "aberto a propostas"), página `/devs`, controle total de privacidade (LGPD: consentimento explícito, exclusão self-service). Reusa `profiles` + novas tabelas `dev_profiles`, `dev_technologies`. **DoD**: 30 perfis criados por membros.

## Fase 5 — Recrutadores publicam vagas
Papel `recruiter`, fluxo de submissão (mesma tela de revisão da IA — recrutador cola URL ou preenche), moderação obrigatória, página da empresa reivindicável. Antispam: aprovação manual de contas recruiter. **DoD**: 5 empresas publicando diretamente.

## Fase 6 — Aplicação pela plataforma
"Candidatar-se com perfil CF Jobs" (envia perfil ao recrutador), tracking de candidaturas do lado do dev. Só faz sentido com massa crítica das fases 4–5.

## Fase 7 — Recomendação por IA
Matching perfil×vaga (embeddings via NIM + pgvector), e-mail/Discord DM semanal "vagas para você" opt-in. pgvector já disponível no Supabase — sem infra nova.

## Fase 8 — Integração Discord
Bot da comunidade: posta vagas novas no canal (consome `/api/v1/jobs`), comando `/vagas react pleno`. Webhook de novas vagas (assinado). Primeira consumidora séria da API pública — valida o contrato v1.

## Fase 9 — Integração LinkedIn
Auto-post de vagas selecionadas na página da comunidade (API oficial de compartilhamento; nunca scraping). Import de perfil LinkedIn para a Fase 4 via export do usuário (não API não-oficial).

## Fase 10 — Marketplace da comunidade
Freelas/projetos entre membros. Reavaliar tudo ao chegar aqui — provavelmente um produto irmão reutilizando auth, design system e reputação.

## Riscos transversais monitorados

| Risco | Mitigação |
|---|---|
| Curadoria vira gargalo (1 admin) | Fase 2 reduz custo por vaga a ~1 min; papel editor distribuído a membros de confiança |
| ATSs mudam formato | adapters isolados + fixtures = correção pontual; fallback genérico sempre existe |
| Free tiers mudarem de política | nada proprietário além do Supabase Auth; ADRs documentam portabilidade |
| Comunidade não adota | Fase 8 (Discord, onde a comunidade vive) é antídoto — pode ser antecipada se o tráfego orgânico decepcionar |
