# CF Jobs — Documentação de Arquitetura

> Especificação técnica completa da plataforma de vagas da comunidade **Coding Ferpa**.
> Produzida como fase de arquitetura. Nenhuma decisão de implementação deve contradizer estes documentos sem um ADR aprovado.

## Como ler esta documentação

Os documentos são numerados na ordem recomendada de leitura. Cada um é autocontido, mas referencia os demais quando necessário. O documento final ([14](14-prompt-de-execucao-opus-5.md)) é o prompt de execução para o Claude Opus 5 — ele assume que todos os anteriores foram lidos.

| Doc | Conteúdo |
|---|---|
| [00 — Visão Geral](00-visao-geral.md) | Objetivos, personas, escopo, princípios de projeto |
| [01 — Stack e Decisões](01-stack.md) | Stack completa com justificativa de cada escolha |
| [02 — Arquitetura do Sistema](02-arquitetura.md) | Componentes, fluxos, diagrama, camadas, estrutura de pastas |
| [03 — Identidade Visual e Design System](03-design-system.md) | Tokens extraídos do codingferpa.org, componentes, UX |
| [04 — Banco de Dados](04-banco-de-dados.md) | ERD, tabelas, índices, RLS, triggers, views, seeds, cron |
| [05 — Pipeline de Importação com IA](05-pipeline-ia.md) | Scraping, adapters, prompt NVIDIA NIM, JSON Schema, erros, custo |
| [06 — APIs](06-apis.md) | Endpoints, payloads, versionamento, OpenAPI, Server Actions |
| [07 — Segurança](07-seguranca.md) | Auth, papéis, RLS, rate limit, SSRF, OWASP |
| [08 — Frontend, Páginas e SEO](08-frontend-seo.md) | Rotas, componentes, Open Graph, Schema.org, acessibilidade |
| [09 — Analytics e Observabilidade](09-analytics-observabilidade.md) | Métricas first-party, dashboard, logs, ferramentas |
| [10 — Escalabilidade](10-escalabilidade.md) | Plano de 100 a 1 milhão de vagas |
| [11 — Open Source e Governança](11-open-source.md) | Estrutura do repo, CI/CD, templates, releases |
| [12 — Qualidade e Testes](12-qualidade.md) | Estratégia de testes, Lighthouse, a11y |
| [13 — Roadmap](13-roadmap.md) | Fases 1–10 com prioridades e critérios de pronto |
| [14 — Prompt de Execução (Opus 5)](14-prompt-de-execucao-opus-5.md) | Plano de implementação fase a fase para o agente executor |

## Resumo executivo das decisões

- **Stack:** Next.js 15 (App Router, RSC) + TypeScript estrito + Tailwind CSS v4 + shadcn/ui + Drizzle ORM + Supabase (Postgres, Auth) + Zod. Deploy na Vercel.
- **IA:** NVIDIA NIM (API OpenAI-compatível em `integrate.api.nvidia.com`), modelo primário `meta/llama-3.3-70b-instruct`, saída estruturada com `guided_json` + validação Zod.
- **Importação:** pipeline com adapters por ATS (Greenhouse, Lever, Ashby, Gupy têm APIs públicas JSON — sem scraping) e fallback genérico JSON-LD → Readability → Markdown.
- **Vagas:** ativas por 30 dias, arquivadas automaticamente via `pg_cron` no Supabase.
- **Taxonomias:** tabelas de lookup pré-populadas; termos desconhecidos entram em fila de revisão humana (`taxonomy_suggestions`).
- **Segurança:** RLS em todas as tabelas, papéis (admin/editor/moderator/reader) via custom claims no JWT, proteção SSRF na importação, rate limit.
- **Analytics:** eventos first-party no Postgres (agregados diariamente) + Vercel Analytics; PostHog opcional na Fase 3.
- **Licença:** MIT. Conventional Commits + Release Please. CI com lint, typecheck, testes e Lighthouse.
