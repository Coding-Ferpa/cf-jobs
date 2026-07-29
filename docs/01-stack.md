# 01 — Stack e Decisões Técnicas

Cada escolha abaixo foi avaliada contra os objetivos do projeto: **alta performance, SEO excelente, baixo custo, simplicidade, facilidade para contribuidores, escalabilidade e manutenção fácil**. Alternativas consideradas e o motivo da rejeição estão registrados em cada seção (estas seções funcionam como os primeiros ADRs do projeto).

## Tabela-resumo

| Camada | Escolha | Alternativas rejeitadas |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | Remix, Astro, SPA React+Vite |
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
| Contrato da API | **zod-openapi + UI Scalar** ([doc 06](06-apis.md)) | escrever o YAML à mão, Swagger UI, Redoc |
| IA | **NVIDIA NIM via Vercel AI SDK** | — (requisito NVIDIA) |
| Rate limit | **Postgres (função SQL) + Vercel WAF** | Upstash Redis |
| Analytics | **First-party no Postgres + Vercel Analytics** | PostHog (fase 3), Plausible |
| Testes | **Vitest + Testing Library + Playwright** | Jest, Cypress |
| Lint/format | **ESLint 9 (flat) + Prettier** | Biome |
| Pacotes | **pnpm** | npm, yarn, bun |
| Node | **24 LTS (mínimo: último patch da série, ≥ 24.15)** | 22 LTS foi a baseline original, elevada por decisão do mantenedor pós-M4.1 (Vercel já tem 24.x como padrão de builds/functions; LTS ativo até abr/2028); 26 fica para quando virar LTS |
| Releases | **Release Please + Conventional Commits** | Changesets |
| Licença | **MIT** | AGPL, Apache-2.0 |

---

## Framework: Next.js 16 (App Router) — por quê

1. **SEO é requisito central.** Vagas precisam ser indexáveis (inclusive Google for Jobs via JSON-LD). React Server Components + geração estática incremental (ISR) entregam HTML completo no primeiro byte, sem hidratação pesada.
2. **Vercel é requisito de deploy.** Next.js é first-class na Vercel: ISR, `revalidateTag`, imagem otimizada, `ImageResponse` para OG images, cron — tudo sem configuração extra e dentro do plano gratuito.
3. **O site da comunidade já é Next.js** (verificado na análise do codingferpa.org — fontes `__Poppins_44151c` do `next/font`). Contribuidores da Coding Ferpa já conhecem o framework; a barreira de entrada cai.
4. **Um único deploy** cobre área pública, admin, API e geração de OG images. Sem orquestrar dois projetos (ex.: Astro público + SPA admin), o que violaria o princípio da simplicidade.

**Por que não Astro:** excelente para conteúdo estático, mas o admin interativo (importação com progresso, revisão de IA, dashboards) exigiria uma segunda stack ou ilhas React extensas. **Por que não Remix/React Router 7:** ótimo framework, porém menor integração com primitivas Vercel (ISR por tag, OG images) e menor familiaridade na comunidade BR. **Por que não SPA (Vite):** SEO ruim sem SSR; adicionar SSR ao Vite reconstruiria o Next.js manualmente.

### Convenções de uso do Next.js

- **Server Components por padrão.** `"use client"` apenas em componentes com interatividade real (filtros, formulários, gráficos).
- **Páginas públicas:** estáticas com ISR (`revalidate` + invalidação da tag `jobs` disparada nas mutations). Nada de `force-dynamic` na área pública. No Next 16 a função dentro de Server Action é `updateTag`, que também relê na hora; `revalidateTag` fica para invalidação de fora, como a do `pg_cron` ([ADR-0014](adr/0014-updatetag-no-lugar-de-revalidatetag.md)).
- **Admin:** dinâmico (dados sempre frescos), protegido por proxy (o antigo middleware, renomeado no Next 16) + verificação de sessão no layout.
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
- Consumido via **Vercel AI SDK** com provider OpenAI-compatible (`createOpenAICompatible`), usada como **camada de protocolo**: tipagem, troca de modelo por configuração e `providerOptions` por onde o `nvext` passa. A orquestração de resiliência — retries, cascata de modelos, rodízio de chaves e espera longa — é do projeto (`maxRetries: 0` na SDK), porque o doc 05 exige comportamento específico que a SDK não modela (ressalva registrada no checkpoint do M6).
- Modelo primário: `meta/llama-3.3-70b-instruct` (custo/qualidade excelente para extração estruturada, contexto 128k). Fallback: `mistralai/mistral-small-24b-instruct` (mais barato/rápido) e, para casos difíceis, `nvidia/llama-3.1-nemotron-70b-instruct`.
- Saída estruturada: `nvext.guided_json` (recurso NIM de decoding guiado por JSON Schema) quando disponível + validação Zod sempre. Detalhes no [doc 05](05-pipeline-ia.md).

## Ferramentas de qualidade — por quê

- **Vitest**: nativo de ESM/TS, rápido, API compatível com Jest (familiaridade). **Playwright**: E2E cross-browser com suporte oficial a CI e a trace viewer (melhor DX de debug que Cypress, sem limites de paralelismo pagos).
- **ESLint + Prettier** em vez de Biome: o pedido do projeto cita ambos explicitamente e o ecossistema de plugins (eslint-plugin-jsx-a11y, @next/eslint-plugin-next) ainda é mais completo — a11y é requisito.
- **Release Please** em vez de Changesets: projeto de app único (não monorepo de libs); Release Please automatiza changelog + versão a partir de Conventional Commits sem passo manual de "adicionar changeset", reduzindo fricção para contribuidores casuais.
- **pnpm**: instalação rápida e determinística, padrão de facto em OSS moderno.

### Majors seguradas de propósito

Verificado no lote de manutenção de 2026-07-29 (M4.1) e revisto no M4.2. Cada linha tem um motivo concreto para ficar onde está — subir exigiria override, desligar proteção ou quebrar o lockfile, e nenhum dos três compensa hoje. **Revisitar quando o motivo sair**, não antes.

| Segurado em | Major disponível | O que trava |
| --- | --- | --- |
| ESLint 9 | 10 | `eslint-plugin-react` (peer `^9.7`) e `eslint-plugin-jsx-a11y` (peer `^9`) não declaram suporte ao 10 nas versões estáveis |
| TypeScript 5.9 | 7 | `typescript-eslint` aborta com "does not support TS 7.0" — o lint inteiro para |
| pnpm 10 | 11 | **Adoção agendada para o M8**, não bloqueio técnico: a política `minimumReleaseAge` do 11 (rejeita pacotes publicados nas últimas 24 h) está **aprovada pelo mantenedor** como postura de supply chain, alinhada ao [doc 07](07-seguranca.md) (A08). Fica para o M8 porque hoje ela recusa 13 pacotes recém-publicados do lockfile; até lá eles terão envelhecido. Na virada, os overrides do [ADR-0011](adr/0011-escopo-do-gate-de-pnpm-audit.md) migram para `pnpm-workspace.yaml` — o 11 deixa de ler o campo `pnpm` do package.json |

`@types/node` fica fora da tabela porque não é bloqueio nenhum: os tipos **acompanham a série do runtime** (24), não a maior publicada (26). Tipar API que o runtime não tem troca erro de compilação por erro de produção.

O jsdom saiu da tabela no M4.2: o 30 exige `^22.22.2 || ^24.15.0 || >=26` e a baseline de Node 24.15 satisfaz a faixa.

## Variáveis de ambiente (contrato)

| Variável | Escopo | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | público | URL canônica do site |
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | Chave anônima (RLS aplica) |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | Somente Server Actions/admin |
| `DATABASE_URL` | servidor | Pooler Supavisor (transaction mode) para Drizzle |
| `DIRECT_URL` | servidor/CI | Conexão direta para migrations |
| `NVIDIA_API_KEY` / `NVIDIA_API_KEY_FALLBACK` | servidor | duas chaves build.nvidia.com em rotação round-robin por chamada (doc 05) — **opcionais no boot**: validadas preguiçosamente pelo módulo de importação no ponto de uso (erro claro se ausentes); o restante do app, inclusive login, sobe sem elas — contribuidor de UI não precisa de chave NVIDIA |
| `AI_MODEL_PRIMARY` / `AI_MODEL_SECONDARY` / `AI_MODEL_FALLBACK` | servidor | Cascata de modelos NIM (com defaults no código, doc 05) |
| `CRON_SECRET` | servidor | Protege endpoints acionados por cron externo (se usados) |

Arquivo `.env.example` obrigatório no repo, sempre atualizado (verificado em CI por script que compara com o schema de env validado por Zod em `src/lib/env.ts` — falha de build se faltar variável).
