-- 0008 — Row Level Security (doc 07)
--
-- O Postgres é a última linha de defesa: middleware e UI melhoram a UX de
-- autorização, mas é aqui que a segurança acontece de fato.
--
-- RLS fica habilitada em TODAS as tabelas, inclusive nas que só o service_role
-- toca — é a defesa contra uma anon key exposta por engano.
--
-- Policy sozinha não libera nada: o Supabase não expõe tabelas novas
-- automaticamente, e o app fala com o banco pelas roles `anon` e
-- `authenticated`. Por isso cada tabela tem GRANT explícito do que suas
-- policies permitem — privilégio e policy contam a mesma história.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select using (id = (select auth.uid()) or public.authorize('admin'));

-- A pessoa edita nome e avatar, nunca o próprio papel: o valor precisa
-- continuar igual ao que está no JWT.
create policy profiles_update_own on public.profiles
  for update
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = nullif(auth.jwt() ->> 'user_role', '')::public.user_role
  );

create policy profiles_all_admin on public.profiles
  for all using (public.authorize('admin')) with check (public.authorize('admin'));

-- ---------------------------------------------------------------------------
-- Lookups — mesma regra para as seis tabelas
-- ---------------------------------------------------------------------------

do $$
declare
  lookup_table text;
begin
  foreach lookup_table in array array[
    'role_categories',
    'seniority_levels',
    'work_modes',
    'contract_types',
    'technologies',
    'tags'
  ]
  loop
    execute format('alter table public.%I enable row level security', lookup_table);
    execute format('grant select on public.%I to anon, authenticated', lookup_table);
    execute format(
      'grant insert, update, delete on public.%I to authenticated',
      lookup_table
    );

    -- Desativada some do público, mas continua visível para quem cura.
    execute format(
      'create policy %I on public.%I for select using (is_active or public.authorize(''moderator''))',
      lookup_table || '_select_public',
      lookup_table
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.authorize(''editor''))',
      lookup_table || '_insert_editor',
      lookup_table
    );
    execute format(
      'create policy %I on public.%I for update using (public.authorize(''editor'')) with check (public.authorize(''editor''))',
      lookup_table || '_update_editor',
      lookup_table
    );
    execute format(
      'create policy %I on public.%I for delete using (public.authorize(''admin''))',
      lookup_table || '_delete_admin',
      lookup_table
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;
grant select on public.companies to anon, authenticated;
grant insert, update, delete on public.companies to authenticated;

create policy companies_select_public on public.companies for select using (true);
create policy companies_insert_editor on public.companies
  for insert with check (public.authorize('editor'));
create policy companies_update_editor on public.companies
  for update using (public.authorize('editor')) with check (public.authorize('editor'));
create policy companies_delete_admin on public.companies
  for delete using (public.authorize('admin'));

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
grant select on public.jobs to anon, authenticated;
grant insert, update, delete on public.jobs to authenticated;

-- Arquivada continua pública: a URL é permanente por SEO (doc 02).
create policy jobs_select_public on public.jobs
  for select using (
    status in ('published', 'archived') or public.authorize('moderator')
  );
create policy jobs_insert_editor on public.jobs
  for insert with check (public.authorize('editor'));
create policy jobs_update_editor on public.jobs
  for update using (public.authorize('editor')) with check (public.authorize('editor'));

-- O doc 07 restringe a capacidade de apagar a rascunhos e rejeitadas; a
-- condição vive aqui também para que a regra não dependa da Server Action.
create policy jobs_delete_admin on public.jobs
  for delete using (
    public.authorize('admin') and status in ('draft', 'rejected')
  );

-- ---------------------------------------------------------------------------
-- Junções — acompanham a visibilidade da vaga
-- ---------------------------------------------------------------------------

alter table public.job_technologies enable row level security;
grant select on public.job_technologies to anon, authenticated;
grant insert, update, delete on public.job_technologies to authenticated;

-- O EXISTS passa pela policy de jobs: vínculo de vaga invisível fica invisível.
create policy job_technologies_select_public on public.job_technologies
  for select using (exists (select 1 from public.jobs j where j.id = job_id));
create policy job_technologies_insert_editor on public.job_technologies
  for insert with check (public.authorize('editor'));
create policy job_technologies_update_editor on public.job_technologies
  for update using (public.authorize('editor')) with check (public.authorize('editor'));
create policy job_technologies_delete_editor on public.job_technologies
  for delete using (public.authorize('editor'));

alter table public.job_tags enable row level security;
grant select on public.job_tags to anon, authenticated;
grant insert, update, delete on public.job_tags to authenticated;

create policy job_tags_select_public on public.job_tags
  for select using (exists (select 1 from public.jobs j where j.id = job_id));
create policy job_tags_insert_editor on public.job_tags
  for insert with check (public.authorize('editor'));
create policy job_tags_update_editor on public.job_tags
  for update using (public.authorize('editor')) with check (public.authorize('editor'));
create policy job_tags_delete_editor on public.job_tags
  for delete using (public.authorize('editor'));

-- ---------------------------------------------------------------------------
-- job_events — escrita anônima controlada, leitura restrita
-- ---------------------------------------------------------------------------

alter table public.job_events enable row level security;
grant insert on public.job_events to anon, authenticated;
grant select on public.job_events to authenticated;

-- O beacon é público por natureza. O que impede abuso está fora da policy:
-- enum de event_type, rate limit, dedup diário e validação no handler.
create policy job_events_insert_public on public.job_events
  for insert with check (true);
create policy job_events_select_admin on public.job_events
  for select using (public.authorize('admin'));

-- ---------------------------------------------------------------------------
-- Pipeline e observabilidade — nada aqui é público
-- ---------------------------------------------------------------------------

alter table public.job_imports enable row level security;
grant select, insert, update on public.job_imports to authenticated;

create policy job_imports_select_moderator on public.job_imports
  for select using (public.authorize('moderator'));
create policy job_imports_insert_editor on public.job_imports
  for insert with check (public.authorize('editor'));
create policy job_imports_update_editor on public.job_imports
  for update using (public.authorize('editor')) with check (public.authorize('editor'));

alter table public.taxonomy_suggestions enable row level security;
grant select, insert, update on public.taxonomy_suggestions to authenticated;

create policy taxonomy_suggestions_select_moderator on public.taxonomy_suggestions
  for select using (public.authorize('moderator'));
create policy taxonomy_suggestions_insert_editor on public.taxonomy_suggestions
  for insert with check (public.authorize('editor'));
-- Revisar a fila é justamente o que moderator existe para fazer.
create policy taxonomy_suggestions_update_moderator on public.taxonomy_suggestions
  for update
  using (public.authorize('moderator'))
  with check (public.authorize('moderator'));

alter table public.job_stats_daily enable row level security;
grant select on public.job_stats_daily to authenticated;

-- Escrita só pelo rollup, que roda como security definer.
create policy job_stats_daily_select_moderator on public.job_stats_daily
  for select using (public.authorize('moderator'));

alter table public.audit_logs enable row level security;
grant select, insert on public.audit_logs to authenticated;

-- Insert-only: sem policy de update ou delete, ninguém reescreve o histórico.
create policy audit_logs_select_moderator on public.audit_logs
  for select using (public.authorize('moderator'));
create policy audit_logs_insert_moderator on public.audit_logs
  for insert with check (public.authorize('moderator'));

-- ---------------------------------------------------------------------------
-- rate_limits — sem policy alguma: só check_rate_limit() (security definer) toca
-- ---------------------------------------------------------------------------

alter table public.rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- Views (security_invoker: a RLS de quem consulta continua valendo)
-- ---------------------------------------------------------------------------

grant select on public.active_jobs to anon, authenticated;
grant select on public.v_dashboard_summary to authenticated;
