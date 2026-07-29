-- 0007 — Funções, triggers e views (docs 04, 06, 07 e 09)

-- ---------------------------------------------------------------------------
-- Autorização
-- ---------------------------------------------------------------------------

-- Hierarquia estrita: admin ⊃ editor ⊃ moderator ⊃ reader (doc 07).
create function public.role_rank(role public.user_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case role
    when 'admin' then 4
    when 'editor' then 3
    when 'moderator' then 2
    when 'reader' then 1
  end;
$$;

-- Lê o papel do claim `user_role` do JWT, injetado pelo Auth Hook — assim
-- nenhuma policy precisa fazer join com profiles.
create function public.authorize(min_role public.user_role)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    public.role_rank(
      nullif(auth.jwt() ->> 'user_role', '')::public.user_role
    ) >= public.role_rank(min_role),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Carimbos e ciclo de vida
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- O rollup noturno mexe só nos contadores; se ele bumpasse updated_at, o
-- lastmod do sitemap mudaria toda noite sem a vaga ter mudado (doc 08).
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row
  when (
    old.* is distinct from new.*
    and (old.views_count, old.clicks_count)
        is not distinct from (new.views_count, new.clicks_count)
  )
  execute function public.set_updated_at();

-- Publicar e arquivar carimbam as datas no banco: a data não depende de a
-- Server Action lembrar de preenchê-la.
create function public.jobs_set_lifecycle_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' then
    if new.published_at is null then
      new.published_at := now();
    end if;
    if new.expires_at is null then
      new.expires_at := new.published_at + interval '30 days';
    end if;
  end if;

  if new.status = 'archived' and new.archived_at is null then
    new.archived_at := now();
  end if;

  return new;
end;
$$;

create trigger jobs_set_lifecycle_dates
  before insert or update on public.jobs
  for each row execute function public.jobs_set_lifecycle_dates();

-- ---------------------------------------------------------------------------
-- Busca full-text
-- ---------------------------------------------------------------------------

-- `search` cobre título, empresa e resumo. As configurações são qualificadas
-- porque a função roda com search_path vazio.
create function public.jobs_search_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  company_name text;
begin
  select name into company_name from public.companies where id = new.company_id;

  new.search :=
    setweight(to_tsvector('pg_catalog.portuguese', coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('pg_catalog.simple', coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('pg_catalog.simple', coalesce(company_name, '')), 'B')
    || setweight(to_tsvector('pg_catalog.portuguese', coalesce(new.summary, '')), 'C');

  return new;
end;
$$;

create trigger jobs_search_update
  before insert or update of title, summary, company_id on public.jobs
  for each row execute function public.jobs_search_update();

-- ---------------------------------------------------------------------------
-- Auth: perfil automático e papel no JWT
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Todo usuário novo nasce `reader`: promover é ação manual de um admin.
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Pessoa contribuidora'
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Custom Access Token Hook: injeta `user_role` nos claims (doc 07).
create function public.custom_access_token(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  profile_role public.user_role;
begin
  select role into profile_role
    from public.profiles
   where id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(
    claims,
    '{user_role}',
    to_jsonb(coalesce(profile_role, 'reader'::public.user_role))
  );

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- O hook é chamado pelo serviço de auth, por ninguém mais.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token(jsonb) from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- Rotinas agendadas (o agendamento em si está em 0009)
-- ---------------------------------------------------------------------------

-- Avisa a Vercel para revalidar o cache. As configurações são definidas por
-- ambiente (`alter database ... set app.revalidate_url = ...`); sem elas — como
-- em local e no CI — a função não tenta rede.
create function public.notify_revalidate()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_url text := nullif(current_setting('app.revalidate_url', true), '');
  secret text := nullif(current_setting('app.cron_secret', true), '');
begin
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

create function public.archive_expired_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived_count integer;
begin
  update public.jobs
     set status = 'archived',
         archived_at = now()
   where status = 'published'
     and expires_at is not null
     and expires_at < now();

  get diagnostics archived_count = row_count;

  if archived_count > 0 then
    perform public.notify_revalidate();
  end if;

  return archived_count;
end;
$$;

-- Idempotente: reprocessar o mesmo dia recalcula em vez de somar (doc 12).
create function public.rollup_job_stats(target_day date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_to_roll date := coalesce(target_day, (now() at time zone 'utc')::date - 1);
  affected integer;
begin
  insert into public.job_stats_daily (job_id, day, views, clicks, shares)
  select
    e.job_id,
    day_to_roll,
    count(*) filter (where e.event_type = 'view'),
    count(*) filter (where e.event_type = 'click_apply'),
    count(*) filter (where e.event_type = 'share')
  from public.job_events e
  where e.occurred_on = day_to_roll
  group by e.job_id
  on conflict (job_id, day) do update
    set views = excluded.views,
        clicks = excluded.clicks,
        shares = excluded.shares;

  get diagnostics affected = row_count;

  update public.jobs j
     set views_count = totals.views,
         clicks_count = totals.clicks
    from (
      select job_id, sum(views)::integer as views, sum(clicks)::integer as clicks
        from public.job_stats_daily
       group by job_id
    ) as totals
   where totals.job_id = j.id
     and (j.views_count, j.clicks_count) is distinct from (totals.views, totals.clicks);

  return affected;
end;
$$;

-- O conteúdo bruto só serve para reprocessar uma importação recente.
create function public.cleanup_imports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned integer;
begin
  update public.job_imports
     set raw_content = null
   where raw_content is not null
     and created_at < now() - interval '7 days';

  get diagnostics cleaned = row_count;
  return cleaned;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limit (doc 07)
-- ---------------------------------------------------------------------------

-- Janela deslizante aproximada por baldes de 1/10 da janela: uma linha por
-- balde em vez de uma por requisição. Retorna false quando estourou o limite.
create function public.check_rate_limit(
  rate_key text,
  max_requests integer,
  window_size interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket_seconds double precision := greatest(extract(epoch from window_size) / 10, 1);
  bucket timestamptz;
  total integer;
begin
  bucket := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / bucket_seconds) * bucket_seconds
  );

  insert into public.rate_limits (key, window_start, request_count)
  values (rate_key, bucket, 1)
  on conflict (key, window_start)
    do update set request_count = public.rate_limits.request_count + 1;

  select coalesce(sum(request_count), 0) into total
    from public.rate_limits
   where key = rate_key
     and window_start > clock_timestamp() - window_size;

  -- Baldes velhos desta chave saem junto: dispensa um cron só para isso.
  delete from public.rate_limits
   where key = rate_key
     and window_start < clock_timestamp() - (window_size * 2);

  return total <= max_requests;
end;
$$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- `security_invoker` é obrigatório: sem ele a view rodaria como dona e
-- devolveria linhas que a RLS de quem consulta esconderia.
create view public.active_jobs with (security_invoker = on) as
  select * from public.jobs where status = 'published';

create view public.v_dashboard_summary with (security_invoker = on) as
  select
    (select count(*) from public.jobs where status = 'published') as jobs_published,
    (select count(*) from public.jobs where status = 'pending_review') as jobs_pending_review,
    (select count(*) from public.jobs where status = 'draft') as jobs_draft,
    (select count(*) from public.jobs where status = 'archived') as jobs_archived,
    (select count(*) from public.jobs where status = 'rejected') as jobs_rejected,
    (select count(*) from public.job_imports where status = 'failed') as imports_failed,
    (select count(*) from public.job_imports where status = 'review') as imports_in_review,
    (select count(*) from public.job_imports where status = 'completed') as imports_completed,
    (
      select avg(latency_ms)::integer
        from public.job_imports
       where finished_at is not null
    ) as avg_import_latency_ms,
    (
      select avg(coalesce(tokens_in, 0) + coalesce(tokens_out, 0))::integer
        from public.job_imports
       where tokens_in is not null
    ) as avg_import_tokens,
    (
      select count(*)
        from public.taxonomy_suggestions
       where status = 'pending'
    ) as suggestions_pending;
