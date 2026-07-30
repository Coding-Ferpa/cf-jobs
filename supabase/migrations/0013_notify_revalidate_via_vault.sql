-- 0013 — As configurações do notify_revalidate saem do Vault (ADR-0018)
--
-- A 0007 mandava defini-las com `alter database ... set app.revalidate_url`.
-- Esse comando não funciona no Supabase: o papel `postgres` não é superusuário
-- e `ALTER DATABASE|ROLE ... SET` de GUC customizado exige isso desde o
-- Postgres 15. Reproduzível no banco local, com a mesma mensagem que apareceu
-- em produção: `42501: permission denied to set parameter`.
--
-- Passou despercebido desde o M1 porque a função é no-op sem as configurações,
-- e no-op é o comportamento certo em local e no CI — o mecanismo nunca chegou a
-- ser exercido em ambiente nenhum.
--
-- O Vault é a resposta do próprio Supabase para dar segredo a rotina que roda
-- dentro do banco, e existe nos dois ambientes: o que se testa em local é o que
-- roda em produção.

create or replace function public.notify_revalidate()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_url text;
  secret text;
begin
  select v.decrypted_secret into target_url
    from vault.decrypted_secrets v
   where v.name = 'cfjobs_revalidate_url';

  select v.decrypted_secret into secret
    from vault.decrypted_secrets v
   where v.name = 'cfjobs_cron_secret';

  -- Contrato inalterado: sem os dois, não há rede. É o que mantém local e CI
  -- offline sem precisar de condicional por ambiente.
  if target_url is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url := target_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.notify_revalidate() is
  'Avisa a Vercel para revalidar o cache. Configurações no Vault: cfjobs_revalidate_url e cfjobs_cron_secret (ADR-0018).';

-- Mesma regra do doc 07 aplicada no M7: `security definer` exposta pelo
-- PostgREST é endpoint público. Esta dispara um POST autenticado a partir do
-- banco — com grant para `anon`, qualquer um com a chave anônima poderia bater
-- no endpoint de revalidação com o token correto quantas vezes quisesse.
-- O `archive_expired_jobs` continua chamando: ele roda como dono.
revoke execute on function public.notify_revalidate() from anon, authenticated, public;
