# ADR-0018 — Vault no lugar de `alter database ... set app.*`

- **Status:** aceita
- **Data:** 2026-07-30
- **Autores:** ida para produção (M8, fase B)

## Contexto

O `notify_revalidate()` (migration 0007) avisa a Vercel para revalidar o cache
quando o cron arquiva vagas. Ele lê duas configurações por
`current_setting('app.revalidate_url', true)` e `current_setting('app.cron_secret', true)`,
e o comentário da própria migration manda defini-las com
`alter database ... set app.revalidate_url = ...`.

Esse comando **não funciona no Supabase**, nem hospedado nem local:

```
alter role postgres set app.teste = 'x'      → ERROR 42501: permission denied to set parameter "app.teste"
alter database postgres set app.teste = 'x'  → ERROR 42501: permission denied to set parameter "app.teste"
```

O papel `postgres` do Supabase não é superusuário, e `ALTER DATABASE|ROLE ... SET`
de GUC customizado exige superusuário desde o Postgres 15. O mantenedor esbarrou
nisso ao configurar produção; a sonda acima reproduz o mesmo erro no banco local.

O erro passou despercebido desde o M1 porque a função **é no-op sem as
configurações** — e no-op era o comportamento esperado em local e no CI. O
único ambiente onde a diferença aparece é produção, e nunca houve produção até
agora. Ou seja: o mecanismo documentado nunca foi exercido em lugar nenhum.

## Decisão

As duas configurações passam a vir do **Supabase Vault**:

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'cfjobs_revalidate_url';
select decrypted_secret from vault.decrypted_secrets where name = 'cfjobs_cron_secret';
```

O Vault é a resposta do próprio Supabase para este caso — dar segredo a rotina
que roda dentro do banco (pg_cron + pg_net). Ele existe em ambos os ambientes
(`supabase_vault` 0.3.1, instalado por padrão), o que mantém **um caminho só**:
o que se testa em local é o que roda em produção.

O contrato da função não muda: **sem os dois segredos ela retorna sem fazer
nada**. É o que mantém local e CI sem rede, como antes.

A URL entra no Vault junto com o segredo, apesar de não ser segredo. O motivo é
não ter dois mecanismos para a mesma configuração: um valor em Vault e outro em
tabela dobraria o que precisa ser lembrado na ida ao ar, e o benefício de
guardar uma URL em claro é nenhum.

Na mesma migration, `notify_revalidate()` deixa de ser executável por `anon` e
`authenticated` (regra do doc 07 ratificada no M7). Ela é `security definer` e
dispara um POST autenticado a partir do banco: exposta pelo PostgREST, dava a
qualquer um com a chave anônima um jeito de bater no endpoint de revalidação com
o token correto, quantas vezes quisesse.

## Consequências

- O runbook passa a mandar criar dois segredos no Vault (painel ou SQL), em vez
  de rodar `alter database`. Não precisa mais reiniciar o projeto — a leitura é
  por consulta, não por parâmetro de sessão.
- Um teste de integração cobre os dois estados (sem segredo → nada na fila do
  pg_net; com segredo → requisição enfileirada para a URL certa). O caminho que
  nunca havia sido exercido passa a ser.
- Quem já tinha `app.*` definido em algum ambiente pode removê-lo: a função não
  lê mais de lá. Nenhum deploy existente depende disso, porque nunca houve.

## Alternativas consideradas

- **Tabela `app_settings` com RLS negando tudo** — funcionaria e não dependeria
  de extensão, mas guardaria o segredo em claro na tabela, e portanto no dump e
  no backup. O Vault existe exatamente para não fazer isso.
- **Passar o segredo no comando agendado** (`cron.schedule(... 'select
  notify_revalidate(''segredo'')')`) — o segredo ficaria legível em
  `cron.job.command`, que é uma tabela consultável. Pior que a anterior.
- **Trocar a autenticação do endpoint por outra coisa** (IP allowlist, assinatura
  do corpo) — resolve o problema errado: o endpoint está correto, o que faltava
  era um lugar para o banco guardar a credencial.
