# Runbooks — produção

Operação do CF Jobs em produção: a ida ao ar, o que vive fora do repositório e
o que fazer quando algo quebra. A especificação de **como o sistema é** está nos
docs 00–14; aqui está o **como se opera**.

Regra que vale para o documento inteiro: **segredo não passa por chat, issue,
PR nem log**. Ele é colado direto no painel que o consome. Este runbook diz qual
variável vai onde e de onde sai o valor — nunca o valor.

---

## 1. Ordem da ida ao ar

A ordem importa: cada passo depende do anterior existir.

| # | Onde | O quê |
|---|---|---|
| 1 | Supabase | Criar projeto, região `sa-east-1` (São Paulo) |
| 2 | Supabase | Extensões, migrations e o seed de taxonomias |
| 3 | Supabase | Custom Access Token Hook, os dois segredos do Vault, pg_cron |
| 4 | GitHub | Environment `producao` com os segredos do `deploy-db.yml` |
| 5 | Vercel | Importar o repositório, Node 24.x, variáveis, **desligar deploy automático de produção** |
| 6 | Sentry | Projeto, DSN e token de upload de source map |
| 7 | DNS | Domínio apontado para a Vercel |
| 8 | — | Primeiro deploy pelo `deploy-db.yml` e a bateria de verificação da seção 6 |

O passo 5 tem uma armadilha: se a Vercel continuar publicando produção sozinha
no push para `main`, o deploy corre junto com as migrations e a ordem que o
[doc 11](11-open-source.md) exige deixa de existir. **Git → Production Branch →
desativar o deploy automático**; quem promove é o hook no fim do `deploy-db.yml`.

---

## 2. Variáveis de ambiente

`pnpm check:env` garante que `.env.example` e o schema de `src/lib/env.ts` não
divergem. O que ele não sabe é de onde vem cada valor — esta é a tabela.

### Aplicação (painel da Vercel → Settings → Environment Variables)

`NEXT_PUBLIC_*` são embutidas no bundle **em tempo de build**: mudar qualquer
uma exige novo deploy, não basta salvar.

| Variável | Sensível | Origem do valor |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | não | O domínio final, com `https://` e sem barra no fim. É o que vai no sitemap, no canonical e no JSON-LD — errar aqui envenena o SEO em silêncio |
| `NEXT_PUBLIC_SUPABASE_URL` | não | Supabase → Project Settings → API → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | não | Supabase → API → **anon public**. Pública por construção: quem protege os dados é a RLS ([doc 07](07-seguranca.md)) |
| `SUPABASE_SERVICE_ROLE_KEY` | **sim** | Supabase → API → **service_role**. Ignora RLS: só em Server Action que já validou sessão e papel |
| `DATABASE_URL` | **sim** | Supabase → Connect → **Transaction pooler** (porta 6543). É a conexão de runtime |
| `DIRECT_URL` | **sim** | Supabase → Connect → **Direct connection** (porta 5432). Só migrations usam |
| `NVIDIA_API_KEY` | **sim** | build.nvidia.com → API Keys |
| `NVIDIA_API_KEY_FALLBACK` | **sim** | Segunda conta do NIM. Opcional: sem ela o rodízio não acontece e o limite por minuto cai pela metade |
| `AI_BASE_URL` | não | **Deixar vazio.** Existe para apontar a outro provedor compatível e para o dublê do E2E |
| `AI_MODEL_PRIMARY` / `_SECONDARY` / `_FALLBACK` | não | **Deixar vazio** para usar a cascata sondada no M6.1 ([ADR-0017](adr/0017-response-format-no-lugar-de-nvext-guided-json.md)) |
| `AI_MONTHLY_TOKEN_BUDGET` | não | Opcional, decisão do mantenedor. Sem ela o painel acompanha o consumo e não bloqueia nada |
| `CRON_SECRET` | **sim** | Gerar aleatório de 32+ caracteres. **O mesmo valor vai no Vault** como `cfjobs_cron_secret` (seção 3.2) |
| `ANALYTICS_SALT` | **sim** | Gerar aleatório de 32+ caracteres. Trocar depois zera a deduplicação de visitantes — os números do dia da troca ficam inflados |
| `NEXT_PUBLIC_SENTRY_DSN` | não | Sentry → projeto → Client Keys (DSN). Público por construção: serve para enviar evento, não para ler |
| `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` | não | GitHub → Developer settings → OAuth Apps. Sem ela o botão "Entrar com GitHub" não aparece |
| `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET` | **sim** | Mesmo OAuth App |
| `SENTRY_AUTH_TOKEN` | **sim** | Sentry → Settings → Auth Tokens, escopos `project:releases` e `org:read`. **Só na Vercel, só em Production.** Nunca no GitHub Actions: o CI não sobe source map, e segredo a mais no CI é superfície a mais |
| `SENTRY_ORG` | não | `coding-ferpa` |
| `SENTRY_PROJECT` | não | `javascript-nextjs` |

As três últimas não estão no `.env.example` de propósito: são de build, não de
runtime, e `check:env` compara o exemplo com o schema do app.

### Workflow de banco (GitHub → Settings → Environments → `producao` → Secrets)

| Segredo | Origem do valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | O `ref` do projeto (aparece na URL do dashboard) |
| `SUPABASE_DB_PASSWORD` | Senha do banco, definida na criação do projeto |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel → Settings → Git → Deploy Hooks, apontando para `main` |

Environment e não repository secret: assim dá para exigir aprovação manual antes
de qualquer migration tocar produção (Environments → Required reviewers).

---

## 3. O que vive fora do repositório

Quatro configurações que nenhum `git push` aplica. As três primeiras são
pendências herdadas dos milestones anteriores — o código já as espera.

### 3.1 Custom Access Token Hook

Injeta `user_role` no JWT; sem ele **toda policy de RLS que chama
`authorize()` enxerga o papel como nulo** e o admin fica inacessível para todo
mundo, inclusive para o admin.

Supabase → Authentication → Hooks → *Custom Access Token* → habilitar,
apontando para `public.custom_access_token`.

Verificação: entrar no admin com uma conta promovida a `admin` e abrir
`/admin/usuarios`. Se a lista aparece, o hook está no ar.

### 3.2 Os dois segredos do Vault

O `notify_revalidate()` avisa a Vercel para revalidar o cache quando o cron
arquiva vagas. Ele lê a URL e o segredo do **Vault** e **retorna sem fazer nada
quando faltam** — em local e no CI é o comportamento desejado; em produção
significa vaga arquivada continuar aparecendo na home até o próximo deploy, sem
erro em lugar nenhum.

> Até o M8 o mecanismo era `alter database ... set app.*`. Ele não funciona no
> Supabase: o papel `postgres` não é superusuário e o comando exige isso
> ([ADR-0018](adr/0018-vault-no-lugar-de-alter-database-set.md)).

No SQL Editor, uma vez — ou pelo painel em Settings → Vault:

```sql
select vault.create_secret(
  'https://SEU-DOMINIO/api/internal/revalidate',
  'cfjobs_revalidate_url',
  'Endpoint que o cron avisa depois de arquivar vagas'
);

select vault.create_secret(
  'O-MESMO-VALOR-DE-CRON_SECRET',
  'cfjobs_cron_secret',
  'Bearer do endpoint de revalidação'
);
```

Para **trocar** um valor depois (a criação falha se o nome já existir):

```sql
select vault.update_secret(id, 'novo-valor')
  from vault.secrets where name = 'cfjobs_cron_secret';
```

Verificação — mostra que existem, sem revelar o segredo:

```sql
select name, created_at from vault.secrets where name like 'cfjobs_%';
```

Não precisa reiniciar o projeto: a leitura é por consulta, não por parâmetro de
sessão.

### 3.3 pg_cron ativo

A migration `0009` agenda os jobs, mas a extensão precisa estar habilitada no
projeto: Database → Extensions → `pg_cron` (e `pg_net`, que o
`notify_revalidate` usa).

Verificação: `select jobname, schedule, active from cron.job;` lista os quatro
(`archive-expired-jobs`, `rollup-job-stats`, `cleanup-imports`,
`prune-job-events`). O badge "Arquivamento automático" do painel fica vermelho
enquanto isso não acontecer — é o mesmo dado, na tela de quem opera.

### 3.4 Seed de produção

Só `supabase/seeds/01-taxonomias.sql`, aplicado uma vez pelo SQL Editor ou por
`psql`. **Nunca o `02-desenvolvimento.sql`**: ele cria conta com senha
conhecida, vaga fictícia e evento sintético.

Verificação: `select count(*) from public.technologies;` devolve o mesmo número
do banco local.

---

## 4. Node e pnpm na Vercel

Node **24.x** em Settings → General → Node.js Version, e o mesmo no runtime das
funções. É a baseline do [doc 01](01-stack.md) e o padrão atual da plataforma —
deixar implícito faz o runtime mudar sozinho na próxima virada de default, o que
é a definição de mudança que ninguém revisou.

O pnpm vem do campo `packageManager` do `package.json` (11.18.0). A política
`minimumReleaseAge` do `pnpm-workspace.yaml` vale também no build da Vercel:
dependência publicada nas últimas 24h faz o build falhar. É intencional (doc 07,
A08) — e é o motivo de um deploy poder falhar logo depois de um PR do
Dependabot.

---

## 5. Release Please

O `release.yml` mantém um PR de release aberto agregando os Conventional
Commits. O merge dele gera a tag semver, o `CHANGELOG.md` e o GitHub Release —
sem publicação no npm (o projeto é uma aplicação).

O que conferir na primeira execução:

1. O workflow precisa de **Settings → Actions → General → Workflow permissions →
   Read and write** e de "Allow GitHub Actions to create and approve pull
   requests". Sem isso ele falha ao abrir o PR.
2. O primeiro PR nasce a partir do `version` do `package.json` (`0.1.0`). O
   `release-type: node` mantém os dois em sincronia.
3. `feat:` sobe minor, `fix:` sobe patch, `feat!:`/`BREAKING CHANGE:` sobe
   major. Commits de `docs:`, `test:`, `ci:` e `build:` entram no changelog mas
   não mudam a versão.

Se o PR não aparecer depois de um `feat:` em `main`, o log do workflow diz o
motivo — quase sempre é a permissão do item 1.

---

## 6. Verificação depois do deploy

Nesta ordem, porque cada uma depende da anterior.

1. **Home no ar** — `/` responde 200 e lista as vagas publicadas (nenhuma, no
   começo).
2. **Cabeçalhos** — `curl -sI https://DOMINIO/ | grep -i content-security` traz
   a CSP com a origem do Supabase e a do Sentry.
3. **Login e papel** — entrar, abrir `/admin`. Se o painel abre, o Custom Access
   Token Hook está funcionando (seção 3.1).
4. **Importação de ponta a ponta** — colar a URL de uma vaga real, acompanhar o
   progresso, revisar e publicar. A vaga aparece na home e o beacon registra a
   visualização (`select count(*) from job_events;` cresce).
5. **Widget de saúde** — os quatro badges. "Arquivamento automático" só fica
   verde depois da primeira execução do cron; até lá ele diz a verdade.
6. **Lighthouse** — `pnpm exec lhci autorun --collect.url=https://DOMINIO/`
   contra os budgets do [doc 12](12-qualidade.md): performance ≥ 90,
   acessibilidade ≥ 95, SEO 100, LCP < 2,5s, CLS < 0,05, JS < 250 kB.
7. **Sentry** — provocar um erro de propósito e conferir no painel. O teste real
   não é o evento chegar: é o **stack trace apontar para a linha do fonte**. Se
   vier minificado, o upload de source map não aconteceu — e ele falha em
   silêncio quando o token está errado, porque build que quebra por causa de
   observabilidade é pior que observabilidade degradada.

---

## 7. Quando algo quebra

### Deploy ruim

Vercel → Deployments → o anterior → **Promote to Production**. Segundos, sem
build. Cuidado: se o deploy ruim veio junto com migration, o rollback do código
sozinho pode deixar código velho com banco novo — é exatamente a janela que a
regra de expand/contract protege, e por isso `pnpm check:migrations` existe.

### Migration ruim

Não há `down`. A correção é uma migration nova que desfaz (e ela também passa
pelo gate). Reverter no banco à mão deixa o histórico do Supabase divergente do
repositório, e a próxima aplicação falha em cima disso.

### Importações falhando em série

O badge fica vermelho acima de 30% em 24h. A ordem de investigação é a do
painel: falha por **etapa** diz onde olhar — `fetching` costuma ser o site fora
do ar; `extracting`, página que monta o conteúdo por JavaScript; `classifying`,
a IA indisponível ou o limite das chaves. `/admin/importacoes` filtra por etapa,
adapter e modelo. A classificação é retomável: o conteúdo já buscado fica em
cache por 24h e "Tentar novamente" vai direto à IA.

### Cron parou

`select jobname, status, start_time, return_message from cron.job_run_details
order by start_time desc limit 20;` mostra a última execução de cada job. Causa
comum: o projeto do Supabase foi pausado por inatividade — o plano gratuito
pausa depois de uma semana sem uso, e o cron para junto.

### Orçamento de IA no limite

O bloqueio é suave: pede confirmação, não impede. Se o consumo surpreender,
`/admin` mostra tokens do mês, custo estimado e o uso por modelo. `AI_MONTHLY_TOKEN_BUDGET`
pode ser ajustada ou removida — a variável é opcional.

### Chave vazada

1. Revogar na origem (Supabase, NVIDIA, Sentry, GitHub OAuth) — **antes** de
   trocar em qualquer lugar.
2. Gerar a nova e colar na Vercel.
3. Redeploy. `NEXT_PUBLIC_*` exige build novo; as demais valem na próxima
   invocação.
4. Se for `CRON_SECRET`, trocar também o `cfjobs_cron_secret` do Vault (seção
   3.2) — senão o cron passa a bater na porta com a senha errada e a
   revalidação para, silenciosamente.
