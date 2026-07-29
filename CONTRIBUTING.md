# Como contribuir

Obrigado pelo interesse! O CF Jobs é um projeto da comunidade **Coding Ferpa** e toda contribuição é bem-vinda — inclusive a primeira da sua vida.

Se em qualquer momento você travar, pergunte no Discord da comunidade ou abra uma issue do tipo **Dúvida**. Não existe pergunta boba aqui.

## Antes de começar

A arquitetura do projeto está decidida e documentada em [`docs/`](docs/README.md). Antes de propor mudanças estruturais, leia o documento da área que você vai mexer — e, se sua proposta contrariar a documentação, abra um [ADR](docs/adr/0000-template.md) explicando o porquê.

## Setup (menos de 10 minutos)

Você precisa de **Node 22+**, **pnpm**, **Git** e **Docker** rodando (o Supabase local sobe em contêineres).

```bash
git clone git@github.com:Coding-Ferpa/cf-jobs.git
cd cf-jobs
pnpm install
cp .env.example .env   # no Windows: copy .env.example .env
pnpm db:start
pnpm dev
```

O `pnpm db:start` imprime `DB_URL`, `API_URL` e as chaves do projeto local — use esses valores no `.env`. O app sobe em <http://localhost:3000>.

Para desenvolvimento existe um admin criado pelo seed: **admin@cfjobs.local** / **cfjobs-local**. Ele só existe no banco local, nunca em produção.

## Fluxo de trabalho

1. Crie uma branch a partir de `main`: `feat/filtro-por-senioridade`, `fix/cursor-duplicado`, `docs/readme-quickstart`.
2. Faça commits pequenos, um assunto por commit.
3. Rode a bateria de qualidade antes de abrir o PR (veja abaixo).
4. Abra o PR preenchendo o template. **PRs acima de 400 linhas são devolvidos para fatiar** — não é rigor, é o que torna a revisão possível.
5. Um mantenedor revisa. CI verde é obrigatório para merge.

## Comandos do dia a dia

| Comando              | O que faz                                       |
| -------------------- | ----------------------------------------------- |
| `pnpm dev`           | Sobe o app em desenvolvimento                   |
| `pnpm lint`          | ESLint (falha com qualquer aviso)               |
| `pnpm format`        | Formata com Prettier                            |
| `pnpm typecheck`     | Checagem de tipos sem emitir arquivos           |
| `pnpm test`          | Testes unitários (Vitest)                       |
| `pnpm test:coverage` | Testes com cobertura e limites do doc 12        |
| `pnpm test:e2e`      | Testes de ponta a ponta (Playwright)            |
| `pnpm db:start`      | Sobe o Supabase local (`pnpm db:stop` derruba)  |
| `pnpm db:reset`      | Recria o banco: migrations do zero + seed       |
| `pnpm db:test`       | Policies e funções do banco (pgTAP)             |
| `pnpm check:env`     | Confere se `.env.example` cobre o schema de env |
| `pnpm check:schema`  | Confere se o schema Drizzle espelha o banco     |

Antes de abrir o PR:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Conventional Commits

O histórico gera o CHANGELOG automaticamente, então o formato importa:

```
feat(import): adapter da Gupy
fix(seo): canonical duplicado na página da vaga
docs: quickstart no README
test(import): fixtures reais do Greenhouse
chore(deps): atualiza tailwind para 4.3
refactor(db): extrai query de listagem
perf(home): remove consulta redundante de facetas
ci: roda pgTAP no workflow de banco
```

Tipos aceitos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `revert`. O escopo é opcional. Escreva o assunto em português, no imperativo e sem ponto final. Se o **porquê** não for óbvio pelo título, explique no corpo do commit.

## Testes

Testamos onde há lógica, não onde há framework ([doc 12](docs/12-qualidade.md)):

- **Pipeline de importação, utils e libs**: testes unitários são obrigatórios; para lógica pura, escreva o teste antes do código.
- **Correção de bug de parsing**: adicione a fixture que reproduz o problema, veja o teste falhar, então corrija.
- **Fluxos de usuário**: um spec E2E enxuto vale mais que dez testes de fachada.
- Cobertura mínima de 80% (linhas e branches) em `src/features` e `src/lib`.

## Mexendo no banco

As migrations são SQL versionado em `supabase/migrations/`, numeradas em sequência. O schema Drizzle em `src/db/schema/` espelha esse SQL à mão — os dois andam no mesmo PR.

Três regras que não abrem exceção:

1. **Tabela nova nasce com RLS na mesma migration.** Nunca "depois": RLS esquecida é o pior bug que este projeto pode ter.
2. **Policy sozinha não libera nada.** Cada tabela precisa também do `grant` correspondente para `anon`/`authenticated`, porque o app fala com o banco por essas roles.
3. **Toda policy nova ganha teste pgTAP** em `supabase/tests/`, afirmando o que cada papel pode e o que não pode.

Depois de mexer, rode:

```bash
pnpm db:reset && pnpm db:test && pnpm check:schema
```

## Sua primeira contribuição

Procure issues com a label **`good first issue`**. Boas portas de entrada:

- Melhorar mensagens de erro ou microcopy em pt-BR.
- Adicionar uma fixture de teste para um portal de vagas que ainda não cobrimos.
- Corrigir detalhes de acessibilidade (rótulos, contraste, navegação por teclado).
- Completar a documentação onde ela ficou vaga para você — se travou, outra pessoa também vai travar.

Comente na issue avisando que vai pegá-la, para ninguém duplicar trabalho.

## Padrões de código

- TypeScript estrito; `any` só com comentário justificando.
- UI sempre em **pt-BR**; o conteúdo da vaga preserva o idioma original.
- Componentes não acessam o banco — recebem dados por props de Server Components.
- Toda entrada externa passa por Zod; toda URL de usuário passa por `safe-fetch`.
- Nunca commite segredos. `.env` está no `.gitignore` e deve continuar assim.

## Segurança

Encontrou uma vulnerabilidade? **Não abra issue pública** — siga o [SECURITY.md](SECURITY.md).
