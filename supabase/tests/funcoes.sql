-- Funções e triggers do banco (docs 04 e 12): busca, ciclo de vida da vaga,
-- rotinas do cron, rate limit e o papel injetado no JWT.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- Cenário conhecido, independente do que o seed traz (rollback no fim).
delete from public.jobs;
delete from public.companies;

insert into public.companies (id, name, slug)
values ('c0000000-0000-4000-8000-000000000001', 'Aurora Pagamentos', 'aurora-pagamentos');

insert into public.jobs (
  id, slug, title, company_id, description_md, summary,
  source_url, source_url_hash, apply_url
) values (
  'a0000000-0000-4000-8000-000000000001', 'vaga-teste', 'Pessoa Desenvolvedora Backend',
  'c0000000-0000-4000-8000-000000000001', '# conteúdo', 'Backend com Clojure',
  'https://exemplo.test/1', 'hash-1', 'https://exemplo.test/1'
);

-- ---------------------------------------------------------------------------
-- Busca full-text
-- ---------------------------------------------------------------------------

select isnt(
  (select search from public.jobs where slug = 'vaga-teste'),
  null,
  'trigger preenche o tsvector de busca'
);

select ok(
  (
    select search @@ websearch_to_tsquery('pg_catalog.simple', 'aurora')
      from public.jobs where slug = 'vaga-teste'
  ),
  'busca encontra a vaga pelo nome da empresa'
);

select ok(
  (
    select search @@ websearch_to_tsquery('pg_catalog.portuguese', 'desenvolvedora')
      from public.jobs where slug = 'vaga-teste'
  ),
  'busca encontra a vaga pelo título'
);

-- ---------------------------------------------------------------------------
-- Ciclo de vida da vaga
-- ---------------------------------------------------------------------------

update public.jobs set status = 'published' where slug = 'vaga-teste';

select isnt(
  (select published_at from public.jobs where slug = 'vaga-teste'),
  null,
  'publicar carimba published_at'
);

select is(
  (select expires_at from public.jobs where slug = 'vaga-teste'),
  (select published_at + interval '30 days' from public.jobs where slug = 'vaga-teste'),
  'expires_at nasce 30 dias após a publicação'
);

-- ---------------------------------------------------------------------------
-- Eventos e rollup
-- ---------------------------------------------------------------------------

insert into public.job_events (job_id, event_type, visitor_hash)
values
  ('a0000000-0000-4000-8000-000000000001', 'view', 'visitante-1'),
  ('a0000000-0000-4000-8000-000000000001', 'view', 'visitante-2'),
  ('a0000000-0000-4000-8000-000000000001', 'click_apply', 'visitante-1');

with repetido as (
  insert into public.job_events (job_id, event_type, visitor_hash)
  values ('a0000000-0000-4000-8000-000000000001', 'view', 'visitante-1')
  on conflict do nothing
  returning 1
)
select is(
  (select count(*) from repetido),
  0::bigint,
  'mesmo visitante não conta duas vezes a mesma ação no dia'
);

create temporary table updated_at_antes as
  select id, updated_at from public.jobs;

select is(
  public.rollup_job_stats(current_date),
  1::integer,
  'rollup agrega os eventos do dia'
);

select is(
  (select views from public.job_stats_daily where day = current_date),
  2::integer,
  'rollup soma as visualizações'
);

select is(
  (select clicks from public.job_stats_daily where day = current_date),
  1::integer,
  'rollup soma os cliques'
);

select is(
  public.rollup_job_stats(current_date),
  1::integer,
  'rollup é idempotente: reprocessar o dia recalcula em vez de somar'
);

select is(
  (select views from public.job_stats_daily where day = current_date),
  2::integer,
  'reprocessar não duplica as visualizações'
);

select is(
  (select views_count from public.jobs where slug = 'vaga-teste'),
  2::integer,
  'rollup atualiza o contador denormalizado da vaga'
);

-- Se o rollup bumpasse updated_at, o lastmod do sitemap mudaria toda noite.
select is(
  (
    select count(*)
      from public.jobs j
      join updated_at_antes a on a.id = j.id
     where j.updated_at <> a.updated_at
  ),
  0::bigint,
  'rollup não altera updated_at das vagas'
);

-- ---------------------------------------------------------------------------
-- Arquivamento
-- ---------------------------------------------------------------------------

select is(
  public.archive_expired_jobs(),
  0::integer,
  'arquivamento não toca em vaga dentro do prazo'
);

update public.jobs set expires_at = now() - interval '1 day' where slug = 'vaga-teste';

select is(
  public.archive_expired_jobs(),
  1::integer,
  'arquivamento pega a vaga vencida'
);

select ok(
  (
    select status = 'archived' and archived_at is not null
      from public.jobs where slug = 'vaga-teste'
  ),
  'arquivar carimba archived_at'
);

-- ---------------------------------------------------------------------------
-- Limpeza de conteúdo bruto
-- ---------------------------------------------------------------------------

insert into public.job_imports (url, url_hash, raw_content, created_at)
values
  ('https://antigo.test', 'h-antigo', 'html antigo', now() - interval '8 days'),
  ('https://recente.test', 'h-recente', 'html recente', now());

select is(
  public.cleanup_imports(),
  1::integer,
  'limpeza descarta apenas o conteúdo bruto com mais de 7 dias'
);

select isnt(
  (select raw_content from public.job_imports where url_hash = 'h-recente'),
  null,
  'limpeza preserva o conteúdo recente'
);

-- ---------------------------------------------------------------------------
-- Rate limit
-- ---------------------------------------------------------------------------

select ok(
  public.check_rate_limit('ip:teste', 2, interval '1 minute'),
  'rate limit libera a primeira requisição'
);
select ok(
  public.check_rate_limit('ip:teste', 2, interval '1 minute'),
  'rate limit libera até o máximo'
);
select ok(
  not public.check_rate_limit('ip:teste', 2, interval '1 minute'),
  'rate limit bloqueia acima do máximo'
);

select * from finish();
rollback;
