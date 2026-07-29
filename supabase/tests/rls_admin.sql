-- Matriz RLS da superfície administrativa: pipeline, sugestões, auditoria,
-- agregados, eventos e perfis (docs 04 e 07).

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

-- Cenário conhecido: as asserções contam linhas e não devem depender do seed.
-- A transação sofre rollback no fim.
delete from public.jobs;
delete from public.companies;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'reader@teste.local', 'x', now(), now(), now(),
   '{}', '{"full_name":"Reader"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'moderator@teste.local', 'x', now(), now(), now(),
   '{}', '{"full_name":"Moderator"}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'editor@teste.local', 'x', now(), now(), now(),
   '{}', '{"full_name":"Editor"}'),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'admin@teste.local', 'x', now(), now(), now(),
   '{}', '{"full_name":"Admin"}');

update public.profiles set role = 'moderator' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set role = 'editor' where id = '33333333-3333-4333-8333-333333333333';
update public.profiles set role = 'admin' where id = '44444444-4444-4444-8444-444444444444';

insert into public.companies (id, name, slug)
values ('c0000000-0000-4000-8000-000000000001', 'Empresa Teste', 'empresa-teste');

insert into public.jobs (
  id, slug, title, company_id, description_md, source_url, source_url_hash,
  apply_url, status
) values (
  'a0000000-0000-4000-8000-000000000001', 'vaga-publicada', 'Vaga Publicada',
  'c0000000-0000-4000-8000-000000000001', '# conteúdo',
  'https://exemplo.test/1', 'hash-publicada', 'https://exemplo.test/1', 'published'
);

insert into public.job_imports (id, url, url_hash, status)
values ('b0000000-0000-4000-8000-000000000001', 'https://exemplo.test/1', 'hash-publicada', 'review');

insert into public.taxonomy_suggestions (id, kind, suggested_label, normalized_slug)
values ('d0000000-0000-4000-8000-000000000001', 'technology', 'Bun', 'bun');

insert into public.audit_logs (action, entity, entity_id)
values ('job.publish', 'jobs', 'a0000000-0000-4000-8000-000000000001');

insert into public.job_stats_daily (job_id, day, views)
values ('a0000000-0000-4000-8000-000000000001', current_date, 10);

insert into public.job_events (job_id, event_type, visitor_hash)
values ('a0000000-0000-4000-8000-000000000001', 'view', 'visitante-1');

-- ---------------------------------------------------------------------------
-- reader — nenhuma superfície administrativa
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"reader"}';

select is((select count(*) from public.job_imports), 0::bigint, 'reader não vê importações');
select is((select count(*) from public.taxonomy_suggestions), 0::bigint, 'reader não vê sugestões');
select is((select count(*) from public.audit_logs), 0::bigint, 'reader não vê auditoria');
select is((select count(*) from public.job_stats_daily), 0::bigint, 'reader não vê agregados');
select is((select count(*) from public.job_events), 0::bigint, 'reader não vê eventos');

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'reader vê apenas o próprio perfil'
);

select throws_ok(
  $$update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  null,
  'reader não promove a si mesmo'
);

with alterado as (
  update public.profiles set display_name = 'Novo Nome'
   where id = '11111111-1111-4111-8111-111111111111'
  returning 1
)
select is((select count(*) from alterado), 1::bigint, 'reader edita o próprio nome');

-- ---------------------------------------------------------------------------
-- moderator — leitura administrativa e revisão da fila
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","user_role":"moderator"}';

select is((select count(*) from public.job_imports), 1::bigint, 'moderator vê importações');
select is((select count(*) from public.taxonomy_suggestions), 1::bigint, 'moderator vê sugestões');
select is((select count(*) from public.audit_logs), 1::bigint, 'moderator vê auditoria');
select is((select count(*) from public.job_stats_daily), 1::bigint, 'moderator vê agregados');

with revisado as (
  update public.taxonomy_suggestions
     set status = 'approved', reviewed_at = now()
   where normalized_slug = 'bun'
  returning 1
)
select is((select count(*) from revisado), 1::bigint, 'moderator revisa sugestão');

select throws_ok(
  $$insert into public.job_imports (url, url_hash) values ('https://novo.test', 'h-novo')$$,
  '42501',
  null,
  'moderator não dispara importação'
);

select lives_ok(
  $$insert into public.audit_logs (action, entity) values ('suggestion.approve', 'taxonomy_suggestions')$$,
  'moderator registra auditoria da própria ação'
);

-- ---------------------------------------------------------------------------
-- editor
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","user_role":"editor"}';

select lives_ok(
  $$insert into public.job_imports (url, url_hash) values ('https://novo.test', 'h-novo')$$,
  'editor dispara importação'
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'editor também só vê o próprio perfil'
);

-- ---------------------------------------------------------------------------
-- admin
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","user_role":"admin"}';

select is(
  (select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'admin vê o perfil de outras pessoas'
);

with promovido as (
  update public.profiles set role = 'editor'
   where id = '11111111-1111-4111-8111-111111111111'
  returning 1
)
select is((select count(*) from promovido), 1::bigint, 'admin altera papel de outra pessoa');

select is((select count(*) from public.job_events), 1::bigint, 'admin lê eventos de analytics');

-- Auditoria é insert-only: nem admin reescreve o histórico.
select throws_ok(
  $$update public.audit_logs set action = 'adulterado'$$,
  '42501',
  null,
  'ninguém altera auditoria'
);

select throws_ok(
  $$delete from public.audit_logs$$,
  '42501',
  null,
  'ninguém apaga auditoria'
);

reset role;
select * from finish();
rollback;
