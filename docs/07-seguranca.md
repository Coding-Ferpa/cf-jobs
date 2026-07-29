# 07 — Segurança

Modelo mental: **o Postgres é a última linha de defesa e a única confiável**. Middleware e UI melhoram UX de autorização; RLS garante a segurança de fato.

## Autenticação (Supabase Auth)

- Métodos: **e-mail/senha** e **GitHub OAuth** (natural para comunidade dev). Cadastro aberto, mas todo usuário novo nasce `reader` (sem acesso ao admin) — promoção a papel superior é ação manual de admin.
- Sessão via cookies (`@supabase/ssr`), tokens rotacionados; o proxy do Next (`src/proxy.ts`, o antigo middleware, renomeado no Next 16) apenas **redireciona** não-autenticados de `/admin` para `/login` (UX); a autorização real acontece no servidor a cada Server Action/página.
- Sair encerra **apenas a sessão atual** (`signOut({ scope: 'local' })`): fechar a sessão em um computador não derruba os outros aparelhos da mesma pessoa.
- **Custom Access Token Hook** injeta `user_role` como claim no JWT. Benefícios: RLS lê o papel do token (`(auth.jwt()->>'user_role')`) sem join com `profiles` em cada policy; o app lê o papel da sessão sem query. Mudança de papel força re-login (trade-off aceito e documentado; sessões duram 1h).

## Papéis e permissões

| Capacidade | reader | moderator | editor | admin |
|---|---|---|---|---|
| Área pública | ✅ | ✅ | ✅ | ✅ |
| Ver admin (somente leitura: dashboards, listas) | — | ✅ | ✅ | ✅ |
| Revisar sugestões de taxonomia | — | ✅ | ✅ | ✅ |
| Importar, editar, publicar, arquivar vagas; CRUD taxonomias/empresas | — | — | ✅ | ✅ |
| Deletar vagas (draft/rejected), gerenciar papéis, configurações | — | — | — | ✅ |

Hierarquia estrita (admin ⊃ editor ⊃ moderator ⊃ reader), implementada por função SQL `authorize(min_role user_role)` que compara ranking — policies e actions usam a mesma semântica.

## RLS — políticas por tabela

RLS habilitado em **todas** as tabelas (inclusive as que só o service_role toca — defesa contra vazamento de anon key mal configurada). Policies nomeadas `tabela_operacao_quem`. Resumo executável (a migration 0008 implementa literalmente):

```sql
-- jobs
create policy jobs_select_public on jobs for select
  using (status in ('published','archived') or authorize('moderator'));
create policy jobs_insert_editor on jobs for insert with check (authorize('editor'));
create policy jobs_update_editor on jobs for update using (authorize('editor'));
create policy jobs_delete_admin  on jobs for delete
  using (authorize('admin') and status in ('draft','rejected')); -- coerente com a matriz de capacidades

-- lookups (todas iguais)
create policy lk_select_public on technologies for select
  using (is_active or authorize('moderator'));
-- insert/update: editor; delete: admin

-- job_events: escrita anônima controlada, leitura restrita
create policy ev_insert_anon on job_events for insert with check (true); -- validação no handler + rate limit
create policy ev_select_admin on job_events for select using (authorize('admin'));

-- job_imports, taxonomy_suggestions, audit_logs, job_stats_daily
--   select: moderator+ · insert/update conforme papel do doc 06 · audit_logs: insert-only

-- profiles
create policy pf_select_own on profiles for select using (id = auth.uid() or authorize('admin'));
create policy pf_update_own on profiles for update
  using (id = auth.uid())
  with check (role::text = coalesce(auth.jwt()->>'user_role', 'reader'));
  -- compara com o claim do JWT — subselect na própria tabela causaria recursão de policy.
  -- usuário edita display_name/avatar mas NUNCA o próprio role
```

Regras adicionais: `service_role` usado **exclusivamente** dentro de Server Actions que já validaram sessão+papel — nunca em Route Handlers públicos; `anon key` só faz o que as policies acima permitem.

## Proteção do pipeline de importação (superfície mais sensível)

- **SSRF** (detalhado no [doc 05](05-pipeline-ia.md)): allowlist de esquema, resolução DNS com bloqueio de faixas privadas/metadata **antes e após cada redirect**, limite de 3 redirects, resposta máx. 5 MB, content-type allowlist, timeout 15s. Implementação centralizada em `lib/safe-fetch.ts` — único caminho permitido para fetch de URL externa fornecida por usuário (regra de lint proíbe `fetch` direto em `features/import`).
- **Prompt injection**: o conteúdo da vaga é dado não confiável que passa pelo LLM. Mitigações: (1) o output é restrito por `guided_json` + Zod — instruções injetadas não têm canal de saída além dos campos tipados; (2) validação semântica (slugs existem? URLs de apply no mesmo domínio ou https válido?); (3) `description_md` é **sanitizado** (rehype-sanitize, allowlist de elementos, zero HTML bruto/scripts/iframes) antes de persistir e novamente ao renderizar; (4) revisão humana obrigatória antes de publicar.
- **Custo**: orçamento mensal de tokens com bloqueio suave (doc 05) — protege contra abuso interno e loops.

## Rate limiting e antiabuso

| Superfície | Limite | Mecanismo |
|---|---|---|
| `GET /api/v1/*` | 60 req/min/IP | função SQL `check_rate_limit` (tabela `rate_limits` com janela deslizante, `ON CONFLICT` atômico) — sem Redis, custo zero; chave = hash(IP) |
| `POST /api/v1/events` | 20/min/IP + dedup diário por visitante | idem + unique parcial |
| `importJob` action | 30/hora por usuário | idem; chave = user_id |
| Login | delegado ao Supabase Auth (rate limits nativos + captcha opcional Turnstile se abuso surgir) | |
| Camada de borda | Vercel WAF/Firewall (regras gratuitas): bloqueio de bots agressivos, países se necessário, challenge automático em picos | |

Anti-scraping da **nossa** listagem: API pública é aberta por decisão (dados de vagas são públicos e o objetivo é divulgação), mas rate limit + cursor pagination impedem dump em massa barato; conteúdo completo só página a página.

## OWASP Top 10 — mapeamento

| Risco | Mitigação |
|---|---|
| A01 Broken Access Control | RLS em tudo; autorização re-checada no servidor por action; testes de policy (pgTAP) |
| A02 Cryptographic Failures | TLS fim a fim; sem PII sensível armazenada; visitor_hash com salt (env) e rotação diária |
| A03 Injection | Drizzle parametriza SQL; Zod em toda entrada; sanitização de Markdown; sem `dangerouslySetInnerHTML` fora do renderer sanitizado |
| A04 Insecure Design | revisão humana no pipeline; princípio do menor privilégio nos papéis |
| A05 Security Misconfiguration | headers via `next.config`: CSP estrita (nonce p/ scripts, `frame-ancestors 'none'`), HSTS, X-Content-Type-Options, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy mínima |
| A06 Vulnerable Components | Dependabot + `pnpm audit` no CI (falha em high/critical) |
| A07 Auth Failures | Supabase Auth gerenciado; cookies httpOnly/secure/sameSite=lax; sem tokens em localStorage |
| A08 Software/Data Integrity | lockfile commitado; CI a partir de fontes fixadas; Server Actions com origin check nativo |
| A09 Logging Failures | audit_logs para toda mutation; logs estruturados sem PII; import trail completo |
| A10 SSRF | ver acima — `safe-fetch` centralizado |

## LGPD / privacidade

- Analytics **sem cookies e sem PII**: `visitor_hash` irreversível e rotativo (dia+salt); IP nunca persistido.
- Página `/privacidade` explicando o que é coletado (nada identificável de visitantes; e-mail apenas de usuários administrativos).
- Dados de vagas são públicos por natureza; fonte sempre atribuída com link oficial.

## Gestão de segredos

Envs somente na Vercel/Supabase (nunca commitadas; `.env.example` sem valores); `SUPABASE_SERVICE_ROLE_KEY` e `NVIDIA_API_KEY` marcadas como sensitive na Vercel; rotação documentada em `docs/runbooks.md` (Fase 1); GitHub Actions usa OIDC/secrets do repo, PRs de forks **não** recebem secrets (workflows de fork rodam apenas lint/test sem env real).
