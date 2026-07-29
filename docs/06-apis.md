# 06 — APIs

## Estratégia geral

Duas superfícies, deliberadamente separadas:

1. **API pública REST versionada (`/api/v1`)** — leitura de vagas e taxonomias + ingestão de eventos. Existe para: (a) integrações da comunidade (bot do Discord na Fase 8, widgets), (b) contrato estável documentado em OpenAPI. **Somente leitura + eventos**; nunca expõe operações administrativas.
2. **Server Actions** — todas as mutations do admin (importar, publicar, editar, CRUD de taxonomias, revisão de sugestões). **Por que não REST para o admin:** Server Actions dão CSRF protection nativa, tipagem ponta a ponta sem client codegen, e menos superfície pública de ataque. O admin é parte do app, não uma integração.

A área pública (RSC) **não** consome a API REST — Server Components chamam `db/queries` diretamente (menos um hop HTTP). A API é para consumidores externos; ambos compartilham as mesmas funções de query (uma implementação, duas portas).

## Convenções

- Versionamento por path (`/api/v1/...`); quebras de contrato → `/api/v2`, v1 mantida por 6 meses (documentado no OpenAPI e no CHANGELOG).
- Respostas JSON `snake_case`; datas ISO 8601 UTC.
- Erros no formato **RFC 9457 Problem Details**: `{ "type", "title", "status", "detail", "instance" }`.
- Paginação **cursor-based** (`cursor` opaco base64 de `(published_at, id)`), `limit` máx. 50, default 20. Sem `offset` (não escala, ver [doc 10](10-escalabilidade.md)).
- Cache: respostas de listagem com `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`; detalhe de vaga `s-maxage=300`. CDN da Vercel absorve a carga.
- CORS: `GET` liberado para qualquer origem (API pública de leitura); `POST /events` restrito ao próprio site.
- Rate limit ([doc 07](07-seguranca.md)): 60 req/min/IP nas leituras, 20/min no `/events`. Headers `X-RateLimit-*` + `429` com `Retry-After`.

## Endpoints

### `GET /api/v1/jobs`
Lista vagas publicadas (default) com filtros combináveis.

| Query param | Tipo | Notas |
|---|---|---|
| `q` | string | busca full-text (tsquery `websearch_to_tsquery`) |
| `tech` | string[] (CSV) | slugs de technologies (AND entre valores) |
| `role`, `seniority`, `work_mode`, `contract_type`, `tag`, `company` | string[] (CSV) | slugs (OR dentro do mesmo param, AND entre params) |
| `city`, `state`, `country` | string | match exato normalizado |
| `status` | `published` \| `archived` \| `all` | default `published` |
| `sort` | `recent` (default) \| `relevance` (só com `q`) | |
| `cursor`, `limit` | paginação | |

Response `200`:
```json
{
  "data": [ { "slug": "senior-backend-nubank-a1b2c3", "title": "...",
      "company": { "name": "Nubank", "slug": "nubank", "logo_url": null },
      "summary": "...", "work_mode": "hybrid", "seniority": "senior",
      "contract_type": "clt", "location": { "city": "São Paulo", "state": "SP", "country": "BR" },
      "salary": { "min": null, "max": null, "currency": null, "period": null },
      "technologies": [ { "slug": "clojure", "label": "Clojure", "is_primary": true } ],
      "tags": ["fintech"], "status": "published",
      "published_at": "2026-07-20T12:00:00Z", "expires_at": "2026-08-19T12:00:00Z",
      "url": "https://vagas.codingferpa.org/vagas/senior-backend-nubank-a1b2c3" } ],
  "page": { "next_cursor": "eyJw...", "has_more": true },
  "meta": { "total_estimate": 132 }
}
```
(`total_estimate` vem de count com limite/estimativa — nunca `count(*)` frio em tabelas grandes.)

### `GET /api/v1/jobs/{slug}`
Detalhe completo (inclui `description_md`, `benefits`, `keywords`, `apply_url`, `source_url`, `language`, contadores). `404` Problem Details se não existir; vagas `archived` retornam `200` com `status: "archived"`.

### `GET /api/v1/taxonomies`
Todas as taxonomias ativas agrupadas: `{ "technologies": [...], "role_categories": [...], "seniority_levels": [...], "work_modes": [...], "contract_types": [...], "tags": [...] }` — para consumidores montarem filtros. Cache 1h.

### `POST /api/v1/events`
Beacon de analytics first-party. Body: `{ "job_slug": "...", "event_type": "view" | "click_apply" | "share", "referrer": "...?" }`. Servidor deriva `visitor_hash` (sha256 IP+UA+dia+salt) — o cliente nunca envia identificadores. Response `202` vazio. Proteções: rate limit, validação de slug existente, dedup por (visitor_hash, job, tipo, dia) via unique parcial — contagem honesta.

### `GET /api/v1/openapi.json` e `GET /api/v1/docs`
Spec **OpenAPI 3.1** gerada a partir dos schemas Zod dos handlers (`zod-openapi`) — o contrato nasce do código, nunca dessincroniza. `/docs` serve UI Scalar (leve, dark-mode) sobre o spec.

### `POST /api/internal/revalidate`
Não versionada, não documentada publicamente. Chamada pelo `pg_cron` (via `pg_net`) após arquivamentos: header `Authorization: Bearer {CRON_SECRET}` → executa `revalidateTag('jobs')`. `401` sem o secret.

## Server Actions (contratos)

Todas em `src/actions/`, todas com o mesmo esqueleto: sessão → Zod input → autorização por papel → operação → `audit_logs` → `revalidateTag`. Retorno padronizado `{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }` — nunca lançam exceção para o client.

| Action | Papel mínimo | Input (Zod) | Efeito |
|---|---|---|---|
| `importJob` | editor | `{ url: string.url }` | roda pipeline do doc 05; retorna `import_id` |
| `retryImport` | editor | `{ import_id }` | nova tentativa com cache |
| `updateJob` | editor | `{ id, ...campos parciais }` | edita vaga; diff no audit |
| `publishJob` | editor | `{ id, expires_at? }` | pending_review → published |
| `rejectJob` / `archiveJob` / `restoreJob` | editor | `{ id, reason? }` | transições de status |
| `deleteJob` | admin | `{ id }` | soft delete apenas de draft/rejected |
| `upsertTaxonomy` | editor | `{ kind, slug?, label, aliases[], kind_specific }` | CRUD lookups |
| `deactivateTaxonomy` | editor | `{ kind, id }` | `is_active=false` (nunca delete com vagas vinculadas) |
| `reviewSuggestion` | moderator | `{ id, decision: approve\|merge\|reject, merge_target_id? }` | fluxo do doc 05 |
| `upsertCompany` | editor | `{ id?, name, website?, logo_url? }` | |
| `setUserRole` | admin | `{ user_id, role }` | audita sempre |

## Erros (catálogo de `code`)

`unauthorized`, `forbidden`, `not_found`, `validation_error`, `duplicate_job` (URL já importada, retorna slug existente), `fetch_failed`, `page_requires_js`, `ai_failed`, `ai_low_confidence` (warning, não erro), `rate_limited`, `budget_exceeded`. A UI do admin mapeia cada código para mensagem em pt-BR acionável.
