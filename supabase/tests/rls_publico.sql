-- Matriz RLS da superfície pública: jobs, lookups, companies, junções e eventos
-- (docs 04 e 07). RLS errada é o pior bug possível do projeto, então cada
-- combinação de tabela × papel × operação tem uma afirmação explícita aqui.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures (como postgres, antes de assumir qualquer papel)
-- ---------------------------------------------------------------------------

-- As asserções contam linhas, então o teste parte de um cenário conhecido em
-- vez de depender do que o seed traz. A transação inteira sofre rollback no
-- fim: nada disso encosta no banco de desenvolvimento.
delete from public.jobs;
delete from public.companies;

insert into public.companies (id, name, slug)
values ('c0000000-0000-4000-8000-000000000001', 'Empresa Teste', 'empresa-teste');

insert into public.jobs (
  id, slug, title, company_id, description_md, source_url, source_url_hash,
  apply_url, status
) values
  (
    'a0000000-0000-4000-8000-000000000001', 'vaga-publicada', 'Vaga Publicada',
    'c0000000-0000-4000-8000-000000000001', '# conteúdo',
    'https://exemplo.test/1', 'hash-publicada', 'https://exemplo.test/1', 'published'
  ),
  (
    'a0000000-0000-4000-8000-000000000002', 'vaga-rascunho', 'Vaga Rascunho',
    'c0000000-0000-4000-8000-000000000001', '# conteúdo',
    'https://exemplo.test/2', 'hash-rascunho', 'https://exemplo.test/2', 'draft'
  ),
  (
    'a0000000-0000-4000-8000-000000000003', 'vaga-arquivada', 'Vaga Arquivada',
    'c0000000-0000-4000-8000-000000000001', '# conteúdo',
    'https://exemplo.test/3', 'hash-arquivada', 'https://exemplo.test/3', 'archived'
  );

insert into public.technologies (slug, label, kind, is_active)
values ('tecnologia-inativa', 'Tecnologia Inativa', 'tool', false);

insert into public.job_technologies (job_id, technology_id)
select j.id, t.id
  from public.jobs j, public.technologies t
 where j.slug in ('vaga-publicada', 'vaga-rascunho') and t.slug = 'postgresql';

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

-- ---------------------------------------------------------------------------
-- Visitante anônimo
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*) from public.jobs),
  2::bigint,
  'anon vê publicada e arquivada, e só isso'
);

select is(
  (select count(*) from public.jobs where slug = 'vaga-rascunho'),
  0::bigint,
  'anon não vê rascunho'
);

select throws_ok(
  $$insert into public.jobs (slug, title, company_id, description_md, source_url, source_url_hash, apply_url)
    values ('nova', 'Nova', 'c0000000-0000-4000-8000-000000000001', '#', 'https://x.test', 'h', 'https://x.test')$$,
  '42501',
  null,
  'anon não cria vaga'
);

select throws_ok(
  $$update public.jobs set title = 'Alterada' where slug = 'vaga-publicada'$$,
  '42501',
  null,
  'anon não edita vaga'
);

select throws_ok(
  $$delete from public.jobs where slug = 'vaga-publicada'$$,
  '42501',
  null,
  'anon não apaga vaga'
);

select is(
  (select count(*) from public.technologies where slug = 'tecnologia-inativa'),
  0::bigint,
  'anon não vê taxonomia desativada'
);

select cmp_ok(
  (select count(*) from public.technologies)::bigint,
  '>',
  0::bigint,
  'anon vê taxonomias ativas'
);

select is(
  (select count(*) from public.companies),
  1::bigint,
  'anon vê empresas'
);

select is(
  (select count(*) from public.job_technologies),
  1::bigint,
  'anon vê vínculo só da vaga visível'
);

select lives_ok(
  $$insert into public.job_events (job_id, event_type, visitor_hash)
    values ('a0000000-0000-4000-8000-000000000001', 'view', 'visitante-1')$$,
  'anon registra evento de analytics'
);

select throws_ok(
  $$select count(*) from public.job_events$$,
  '42501',
  null,
  'anon não lê eventos'
);

-- ---------------------------------------------------------------------------
-- reader (autenticado sem acesso administrativo)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"reader"}';

select is(
  (select count(*) from public.jobs),
  2::bigint,
  'reader enxerga o mesmo que anon'
);

select throws_ok(
  $$insert into public.jobs (slug, title, company_id, description_md, source_url, source_url_hash, apply_url)
    values ('nova-reader', 'Nova', 'c0000000-0000-4000-8000-000000000001', '#', 'https://y.test', 'h2', 'https://y.test')$$,
  '42501',
  null,
  'reader não cria vaga'
);

select is(
  (select count(*) from public.technologies where slug = 'tecnologia-inativa'),
  0::bigint,
  'reader não vê taxonomia desativada'
);

select is(
  (select count(*) from public.job_imports),
  0::bigint,
  'reader não vê a fila de importação'
);

-- ---------------------------------------------------------------------------
-- moderator (leitura administrativa)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","user_role":"moderator"}';

select is(
  (select count(*) from public.jobs),
  3::bigint,
  'moderator vê inclusive rascunho'
);

select is(
  (select count(*) from public.technologies where slug = 'tecnologia-inativa'),
  1::bigint,
  'moderator vê taxonomia desativada'
);

select throws_ok(
  $$insert into public.jobs (slug, title, company_id, description_md, source_url, source_url_hash, apply_url)
    values ('nova-mod', 'Nova', 'c0000000-0000-4000-8000-000000000001', '#', 'https://z.test', 'h3', 'https://z.test')$$,
  '42501',
  null,
  'moderator não cria vaga'
);

-- O CTE que modifica dados precisa ficar no topo da instrução, por isso o
-- `with` envolve o `select is(...)` em vez de morar dentro dele.
with alterado as (
  update public.jobs set title = 'Alterada' where slug = 'vaga-rascunho' returning 1
)
select is((select count(*) from alterado), 0::bigint, 'moderator não edita vaga');

-- ---------------------------------------------------------------------------
-- editor (curadoria)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","user_role":"editor"}';

select lives_ok(
  $$insert into public.jobs (slug, title, company_id, description_md, source_url, source_url_hash, apply_url)
    values ('nova-editor', 'Nova do Editor', 'c0000000-0000-4000-8000-000000000001', '#', 'https://w.test', 'h4', 'https://w.test')$$,
  'editor cria vaga'
);

with alterado as (
  update public.jobs set title = 'Alterada' where slug = 'vaga-rascunho' returning 1
)
select is((select count(*) from alterado), 1::bigint, 'editor edita vaga');

with removido as (
  delete from public.jobs where slug = 'nova-editor' returning 1
)
select is((select count(*) from removido), 0::bigint, 'editor não apaga vaga');

-- ---------------------------------------------------------------------------
-- admin
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","user_role":"admin"}';

with removido as (
  delete from public.jobs where slug = 'vaga-publicada' returning 1
)
select is((select count(*) from removido), 0::bigint, 'admin não apaga vaga publicada');

with removido as (
  delete from public.jobs where slug = 'vaga-rascunho' returning 1
)
select is((select count(*) from removido), 1::bigint, 'admin apaga rascunho');

reset role;
select * from finish();
rollback;
