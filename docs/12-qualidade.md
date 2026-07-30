# 12 — Qualidade e Testes

## Pirâmide adotada (pragmática, não dogmática)

```
        E2E (Playwright) — poucos, críticos
      Integração (Vitest + Supabase local, pgTAP)
    Unitários (Vitest) — pipeline de import é o foco
```

Regra de ouro: **testar onde há lógica, não onde há framework.** CRUD trivial é coberto por integração/E2E; o pipeline de importação (parsing, mapeamento, validação) exige bateria unitária extensa.

## Unitários (Vitest + Testing Library)

| Alvo | Estratégia |
|---|---|
| **Adapters de extração** (`features/import/adapters`) | **fixtures de HTML/JSON reais** (páginas salvas de Greenhouse, Lever, Ashby, Gupy, genéricas — anonimizadas) em `src/features/import/__fixtures__/`; cada adapter testado contra 2+ fixtures; adicionar fixture é o caminho padrão para corrigir bug de parsing (red → green) |
| Extração JSON-LD / Readability / truncamento | fixtures com edge cases (multi JSON-LD, LD malformado, página SPA vazia) |
| `classify` (chamada IA) | **mock da API NIM**; testa: retry de reparo com resposta inválida, fallback de modelo em 429, timeout, validação Zod, rejeição por baixa confiança |
| `map-taxonomies` | matching exato/alias/trigram (trigram testado na integração), geração de sugestões, não-duplicação |
| `safe-fetch` (SSRF) | tabela de URLs maliciosas (IP privado, redirect p/ metadata, resposta gigante) — **todas devem falhar** |
| Utils (slug, canonicalização de URL, cursor) | property-based leve onde couber (fast-check para canonicalização) |
| Componentes com lógica (filtros, chips, formulário de revisão) | Testing Library; sem testar estilo |

## Integração (Vitest contra Supabase local)

- Migrations aplicadas do zero + seed a cada suíte (banco descartável do `supabase start` no CI).
- **pgTAP para RLS** (inegociável): para cada tabela × papel × operação da matriz do [doc 07](07-seguranca.md), um teste afirma permitido/negado. É o teste mais valioso do projeto — RLS errada é o pior bug possível.
- Queries de listagem: filtros combinados, cursor pagination (estabilidade de ordenação com published_at empatado), busca full-text pt/en.
- Funções de banco: `archive_expired_jobs` (arquiva certo, não arquiva errado), `rollup_job_stats` (agregação correta, idempotente), `check_rate_limit`.
- Server Actions: happy path + autorização negada por papel insuficiente (chamadas com sessões forjadas de cada papel).

## E2E (Playwright, chromium no CI; webkit/firefox semanal)

Fluxos críticos apenas (~10 specs):
1. Visitante: home → busca "react" → filtra remoto+pleno → abre vaga → clica candidatar-se (verifica beacon + nova aba).
2. Compartilhar: copia link, abre em contexto anônimo, página correta com OG tags presentes.
3. Vaga arquivada: acessível por URL, banner, fora da listagem padrão, presente com filtro "arquivadas".
4. Admin: login → importa URL (NIM **mockado por rota interceptada**) → tela de revisão pré-preenchida → publica → vaga aparece na home.
5. Fila de sugestões: aprovar cria taxonomia; mesclar adiciona alias.
6. Autorização: reader não acessa /admin/vagas; moderator não publica.
7. A11y: axe-core (`@axe-core/playwright`) em home, vaga e admin — zero violações `serious`/`critical`.
8. SEO: página de vaga contém JSON-LD JobPosting válido (parse + campos obrigatórios), canonical, sitemap inclui a vaga publicada e exclui arquivada.

## Cobertura e gates de CI

- Cobertura global mínima: **80% lines/branches em `src/features` e `src/lib`** (onde mora a lógica); sem meta de cobertura para componentes de UI e rotas (E2E cobre) — metas infladas geram testes de fachada.
- Gates bloqueantes no PR: lint, typecheck, unit, integração+pgTAP, E2E, Lighthouse budgets.

## Lighthouse CI (budgets — falham o PR)

| Métrica | Budget (mobile, simulado) |
|---|---|
| Performance score | ≥ 90 |
| Acessibilidade | ≥ 95 |
| SEO | = 100 |
| LCP | < 2.5s (lab) |
| CLS | < 0.05 |
| JS total | < 250 kB comprimido na home |

## Responsividade

Breakpoints testados em E2E com viewports: 375 (mobile), 768 (tablet), 1280 (desktop). Checklist visual no PR template para mudanças de UI (screenshot mobile+desktop do preview deploy).

**Limite conhecido do projeto `mobile` (medido no M7):** na emulação de dispositivo, `document.documentElement.clientWidth` responde 412 e `window.innerWidth` responde 949 — o layout usado pelo `boundingBox()` não é o mesmo em que o ponteiro é despachado, e o clique erra o alvo proporcionalmente à distância do topo da página. Alvo perto do topo funciona; alvo no meio de uma página longa cai em outro elemento. Por isso specs de **interação fundo de página** rodam só no `chromium`, com o motivo escrito na spec; as de **visibilidade** — que é o que o viewport estreito tem a dizer — rodam nos dois.

## Qualidade de código contínua

- TypeScript `strict` + `noUncheckedIndexedAccess`; proibido `any` sem comentário justificando (regra ESLint).
- `eslint-plugin-jsx-a11y`, `@next/eslint-plugin-next`, regra custom proibindo `fetch` direto em `features/import` (usar `safe-fetch`) e imports de `db/` em componentes.
- Revisão de PR: 1 mantenedor; PRs > 400 linhas são devolvidos para fatiar (norma no CONTRIBUTING).
