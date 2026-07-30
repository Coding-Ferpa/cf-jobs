-- 0012 — As rotinas de manutenção deixam de ser públicas (doc 07)
--
-- Achado na auto-revisão do M7. O Postgres concede `execute` a `public` em
-- toda função nova, e no Supabase os papéis `anon` e `authenticated` estão
-- expostos pelo PostgREST: qualquer pessoa com a chave anônima — que é
-- pública por construção — podia chamar
--
--   POST /rest/v1/rpc/prune_job_events   {"retention_days": 0}
--
-- e apagar os eventos de todas as vagas. As funções são `security definer`,
-- então rodam como dona e a RLS nem entra na conversa. O mesmo valia para
-- `cleanup_imports` (esvazia o cache de conteúdo), `archive_expired_jobs`
-- (tira vaga do ar) e `rollup_job_stats` (reescreve os agregados).
--
-- O padrão já existia no projeto: a 0007 revoga `custom_access_token` de todo
-- mundo menos do `supabase_auth_admin`. Faltava aplicá-lo ao resto.
--
-- `check_rate_limit` fica de fora **de propósito**: quem a chama é a própria
-- aplicação dentro de `queryAsAnon`, ou seja, com `set local role anon`.
-- Revogá-la desligaria o rate limit da API pública — e ela não destrói nada,
-- só incrementa um contador da chave que recebeu.

revoke execute on function public.archive_expired_jobs() from anon, authenticated, public;
revoke execute on function public.rollup_job_stats(date) from anon, authenticated, public;
revoke execute on function public.cleanup_imports() from anon, authenticated, public;
revoke execute on function public.prune_job_events(integer) from anon, authenticated, public;

-- O pg_cron roda como `postgres`, que é dono das funções e não depende de
-- grant. As migrations e o seed também.
