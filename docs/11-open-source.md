# 11 — Open Source e Governança

## Licença: MIT

Máxima adoção e simplicidade — a comunidade pode aprender, forkar e reutilizar sem fricção jurídica. AGPL foi considerada (impedir clones fechados) e rejeitada: o valor do projeto está na comunidade e na curadoria, não no código; barreiras legais afastariam contribuidores iniciantes.

## Arquivos de governança (raiz do repo)

| Arquivo | Conteúdo essencial |
|---|---|
| `README.md` | pitch + screenshot, stack, **Quickstart ≤ 10 min** (pnpm install → supabase start → seed → pnpm dev), badges (CI, license, good first issues), link para docs/ |
| `CONTRIBUTING.md` | setup detalhado, fluxo de branch (`feat/`, `fix/` a partir de `main`), Conventional Commits com exemplos pt-BR, como rodar testes, guia "sua primeira contribuição", onde pedir ajuda (Discord da comunidade) |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1 traduzido, alinhado ao código de conduta existente da Coding Ferpa |
| `LICENSE` | MIT |
| `SECURITY.md` | como reportar vulnerabilidade em privado (e-mail dos mantenedores; GitHub private vulnerability reporting habilitado) |
| `.github/CODEOWNERS` | mantenedores iniciais |

## Estrutura de repositório

Single-repo de app único (estrutura no [doc 02](02-arquitetura.md)). **Sem monorepo/workspaces**: não há pacotes compartilháveis; Turborepo/Nx adicionariam conceito extra para contribuidor iniciante sem benefício.

## GitHub — templates e automação

- **Issue templates** (YAML forms): 🐛 bug (passos, esperado/observado, prints), ✨ feature (problema antes de solução), 🧹 chore, ❓ dúvida → redireciona ao Discord. Labels padrão: `good first issue`, `help wanted`, `area:import`, `area:ui`, `area:db`, `area:seo`, `prioridade:alta/média/baixa`.
- **PR template**: o que/por quê, como testar, checklist (testes passam, lint ok, docs atualizadas se preciso, screenshot se UI).
- **Dependabot**: npm (semanal, agrupado minor/patch) + github-actions (mensal). Auto-merge de patch com CI verde via regra do repositório.
- **Branch protection em `main`**: CI verde obrigatório, 1 review (mantenedor), sem force-push, linear history.

## CI/CD (GitHub Actions)

### `ci.yml` — em todo PR e push em main
```
jobs:
  quality:   pnpm lint + prettier --check + tsc --noEmit + verificação .env.example
  test:      vitest run --coverage (threshold: ver doc 12) 
  db:        supabase start (container) → aplicar migrations do zero → seed → pgTAP (policies RLS)
  e2e:       next build → playwright (chromium) contra build local + supabase local
  lighthouse: lhci autorun nas rotas / e /vagas/[seed-slug] (build local) — budgets do doc 08
```
Paralelizado; PRs de fork rodam sem secrets (steps que exigem env real usam `if: github.event.pull_request.head.repo.full_name == github.repository`).

### Deploy
- **Vercel Git integration** (não Actions): preview deploy por PR (link automático para revisão visual), produção no merge em `main`. Migrations de produção: workflow `deploy-db.yml` manual/no merge que roda `supabase db push` com secrets — **migrations aplicam antes do deploy** (ordem garantida: workflow conclui → promove produção via Vercel deploy hook). Regra de compatibilidade: toda migration deve ser retrocompatível com o deploy anterior (expand/contract).

### `release.yml`
**Release Please**: mantém PR de release aberto agregando Conventional Commits → merge gera tag semver + CHANGELOG.md + GitHub Release. Sem publicação npm (é app, não lib).

## Conventional Commits (contrato)

`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`, `ci:` + escopo opcional (`feat(import): adapter gupy`). Enforçado por commitlint no CI (não em hook local pesado — contribuidor iniciante não pode ser bloqueado por tooling local; husky roda apenas lint-staged rápido).

## ADRs

`docs/adr/NNNN-titulo.md` (template MADR simplificado: contexto, decisão, consequências, alternativas). Os docs 01–10 constituem os ADRs fundadores (referenciados como ADR-0001..0010). Toda mudança arquitetural futura exige ADR no PR.
