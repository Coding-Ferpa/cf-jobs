# 01 — Stack e Decisões Técnicas

Cada escolha abaixo foi avaliada contra os objetivos do projeto: **alta performance, SEO excelente, baixo custo, simplicidade, facilidade para contribuidores, escalabilidade e manutenção fácil**. Alternativas consideradas e o motivo da rejeição estão registrados em cada seção (estas seções funcionam como os primeiros ADRs do projeto).

## Tabela-resumo

| Camada | Escolha | Alternativas rejeitadas |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Remix, Astro, SPA React+Vite |
| Linguagem | **TypeScript (strict)** | — |
| UI | **Tailwind CSS v4 + shadcn/ui** | CSS Modules, Chakra, MUI |
| Dados (server) | **Drizzle ORM** | Prisma, supabase-js puro |
| Dados (client) | **TanStack Query (só no admin)** | SWR, Zustand para server-state |
| Estado de filtros | **URL como estado (`nuqs`)** | Zustand, Redux |
| Validação | **Zod** | Valibot, Yup |
| Banco + Auth | **Supabase (Postgres + Auth)** | — (requisito) |
| Agendamento | **pg_cron (Supabase)** | Vercel Cron, Supabase Edge Functions |
| Mutations admin | **Server Actions** | API REST interna |
| API pública | **Route Handlers (`/api/v1`)** | tRPC, GraphQL |
| IA | **NVIDIA NIM via Vercel AI SDK** | — (requisito NVIDIA) |
| Rate limit | **Postgres (função SQL) + Vercel WAF** | Upstash Redis |
| Analytics | **First-party no Postgres + Vercel Analytics** | PostHog (fase 3), Plausible |
| Testes | **Vitest + Testing Library + Playwright** | Jest, Cypress |
| Lint/format | **ESLint 9 (flat) + Prettier** | Biome |
| Pacotes | **pnpm** | npm, yarn, bun |
| Node | **22 LTS** | — |
| Releases | **Release Please + Conventional Commits** | Changesets |
| Licença | **MIT** | AGPL, Apache-2.0 |

---

## Framework: Next.js 15 (App Router) — por quê

1. **SEO é requisito central.** Vagas precisam ser indexáveis (inclusive Google for Jobs via JSON-LD). React Server Components + geração estática incremental (ISR) entregam HTML completo no primeiro byte, sem hidratação pesada.
2. **Vercel é requisito de deploy.** Next.js é first-class na Vercel: ISR, `revalidateTag`, imagem otimizada, `ImageResponse` para OG images, cron — tudo sem configuração extra e dentro do plano gratuito.
3. **O site da comunidade já é Next.js** (verificado na análise do codingferpa.org — fontes `__Poppins_44151c` do `next/font`). Contribuidores da Coding Ferpa já conhecem o framework; a barreira de entrada cai.
4. **Um único deploy** cobre área pública, admin, API e geração de OG images. Sem orquestrar dois projetos (ex.: Astro público + SPA admin), o que violaria o princípio da simplicidade.

**Por que não Astro:** excelente para conteúdo estático, mas o admin interativo (importação com progresso, revisão de IA, dashboards) exigiria uma segunda stack ou ilhas React extensas. **Por que não Remix/React Router 7:** ótimo framework, porém menor integração com primitivas Vercel (ISR por tag, OG images) e menor familiaridade na comunidade BR. **Por que não SPA (Vite):** SEO ruim sem SSR; adicionar SSR ao Vite reconstruiria o Next.js manualmente.

### Convenções de uso do Next.js

- **Server Components por padrão.** `"use client"` apenas em componentes com interatividade real (filtros, formulários, gráficos).
- **Páginas públicas:** estáticas com ISR (`revalidate` + `revalidateTag('jobs')` disparado nas mutations). Nada de `force-dynamic` na área pública.
- **Admin:** dinâmico (dados sempre frescos), protegido por middleware + verificação de sessão no layout.
- **Runtime Node.js** (não Edge) para rotas que usam Drizzle/IA — evita limitações de driver e de timeout do Edge runtime.

## UI: Tailwind CSS v4 + shadcn/ui — por quê

1. Os tokens do codingferpa.org (ver [Design System](03-design-system.md)) mapeiam 1:1 para o `@theme` do Tailwind v4 — a identidade visual vira configuração, não CSS artesanal.
2. shadcn/ui copia componentes para dentro do repo (não é dependência): contribuidores leem e alteram o código dos componentes diretamente, alinhado ao espírito open source. Acessibilidade (Radix) de graça.
3. Zero custo de runtime (CSS puro, sem CSS-in-JS), o que preserva performance e RSC.

**Por que não MUI/Chakra:** estética própria difícil de alinhar à identidade da comunidade; peso de bundle; fricção com Server Components.

## ORM: Drizzle — por quê

1. **SQL-first.** O projeto depende de recursos avançados do Postgres (RLS, tsvector, triggers, pg_cron, views). Drizzle gera migrations SQL legíveis que convivem com SQL manual — essencial porque **as policies RLS e triggers serão escritas em SQL puro dentro das mesmas migrations**.
2. Leve (sem engine binária), rápido em cold start de serverless functions.
3. Schema TypeScript = tipos inferidos de graça para todo o app.

**Por que não Prisma:** engine mais pesada em cold starts serverless, migrations menos amigáveis a SQL manual (RLS/triggers viram "drift"), e abstrai o SQL que queremos que contribuidores aprendam. **Por que não supabase-js puro para tudo:** sem tipagem de queries complexas e sem migrations versionadas no repo; supabase-js continua sendo usado para **Auth** e para chamadas client-side onde RLS é a barreira.

### Regra de acesso a dados (importante)

- **Leitura pública (RSC/API v1):** Drizzle com a role `anon`/`authenticated` via connection pooler (Supavisor, modo transaction) — RLS aplicada.
- **Admin (Server Actions):** Drizzle com `service_role` **somente após** verificação explícita de sessão + papel no servidor; toda mutation registra em `audit_logs`.
- **Client-side:** apenas supabase-js para auth e realtime (se necessário); nunca queries de negócio no client.

## Estado: URL primeiro, TanStack Query no admin — por quê

- **Área pública:** o estado dos filtros vive na URL (`?tech=react&senioridade=pleno`), gerenciado com `nuqs`. Benefícios: URLs compartilháveis (requisito de compartilhamento), SEO de páginas filtradas, botão voltar funciona, zero store global. **Zustand foi rejeitado no MVP** — não há estado global cliente que a URL ou o React não resolvam; adicionar store é complexidade especulativa.
- **Admin:** TanStack Query para cache/refetch/optimistic updates nas telas interativas (fila de revisão, dashboards com polling). React Query só onde há interatividade real.

## Supabase: como cada recurso será usado

| Recurso | Uso | Justificativa |
|---|---|---|
| Postgres | Todo o dado do sistema, inclusive fila de importação, eventos de analytics e cache de conteúdo bruto | Um único sistema de armazenamento = simplicidade e custo zero |
| Auth | Login do admin (e-mail/senha + GitHub OAuth), custom claims de papel via Auth Hook | Requisito do projeto; GitHub OAuth é natural para comunidade dev |
| RLS | Autorização em nível de linha para todas as tabelas | Ver [Segurança](07-seguranca.md) |
| pg_cron + pg_net | Arquivamento diário de vagas, rollup de estatísticas, refresh de materialized views | Roda no banco; funciona mesmo se a Vercel estiver fora; sem cold start |
| Storage | Logos de empresas (Fase 2+) | MVP usa URL externa do logo |
| Edge Functions | **Não usadas no MVP** | Toda lógica cabe em funções Vercel (Node runtime); duas plataformas de função = complexidade desnecessária. Reavaliar se surgir necessidade de webhooks pesados |
| Realtime | Não usado no MVP | Polling no admin é suficiente |

**Agendamento — decisão:** `pg_cron` no Supabase é o mecanismo primário (arquivar vagas, agregar stats). **Vercel Cron** fica como alternativa documentada caso o projeto migre de banco. Motivo: o arquivamento é uma operação puramente SQL (`UPDATE ... WHERE published_at < now() - interval '30 days'`); acioná-la de fora (Vercel → HTTP → banco) adiciona um salto de rede e um endpoint a proteger, sem ganho.

## IA: NVIDIA NIM — como será consumido

- Endpoint OpenAI-compatível: `https://integrate.api.nvidia.com/v1/chat/completions` com `NVIDIA_API_KEY`.
- Consumido via **Vercel AI SDK** com provider OpenAI-compatible (`createOpenAICompatible`): troca de modelo/provedor vira configuração; retries e streaming resolvidos pela SDK.
- Modelo primário: `meta/llama-3.3-70b-instruct` (custo/qualidade excelente para extração estruturada, contexto 128k). Fallback: `mistralai/mistral-small-24b-instruct` (mais barato/rápido) e, para casos difíceis, `nvidia/llama-3.1-nemotron-70b-instruct`.
- Saída estruturada: `nvext.guided_json` (recurso NIM de decoding guiado por JSON Schema) quando disponível + validação Zod sempre. Detalhes no [doc 05](05-pipeline-ia.md).

## Ferramentas de qualidade — por quê

- **Vitest**: nativo de ESM/TS, rápido, API compatível com Jest (familiaridade). **Playwright**: E2E cross-browser com suporte oficial a CI e a trace viewer (melhor DX de debug que Cypress, sem limites de paralelismo pagos).
- **ESLint + Prettier** em vez de Biome: o pedido do projeto cita ambos explicitamente e o ecossistema de plugins (eslint-plugin-jsx-a11y, @next/eslint-plugin-next) ainda é mais completo — a11y é requisito.
- **Release Please** em vez de Changesets: projeto de app único (não monorepo de libs); Release Please automatiza changelog + versão a partir de Conventional Commits sem passo manual de "adicionar changeset", reduzindo fricção para contribuidores casuais.
- **pnpm**: instalação rápida e determinística, padrão de facto em OSS moderno.

## Variáveis de ambiente (contrato)

| Variável | Escopo | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | público | URL canônica do site |
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | Chave anônima (RLS aplica) |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | Somente Server Actions/admin |
| `DATABASE_URL` | servidor | Pooler Supavisor (transaction mode) para Drizzle |
| `DIRECT_URL` | servidor/CI | Conexão direta para migrations |
| `NVIDIA_API_KEY` | servidor | build.nvidia.com — **opcional no boot**: validada preguiçosamente pelo módulo de importação no ponto de uso (erro claro se ausente); o restante do app, inclusive login, sobe sem ela — contribuidor de UI não precisa de chave NVIDIA |
| `AI_MODEL_PRIMARY` / `AI_MODEL_FALLBACK` | servidor | Ids dos modelos NIM (com defaults no código) |
| `CRON_SECRET` | servidor | Protege endpoints acionados por cron externo (se usados) |

Arquivo `.env.example` obrigatório no repo, sempre atualizado (verificado em CI por script que compara com o schema de env validado por Zod em `src/lib/env.ts` — falha de build se faltar variável).
