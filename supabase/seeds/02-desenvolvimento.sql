-- Dados de desenvolvimento: empresas, vagas, eventos e contas de exemplo.
--
-- **Nunca roda em produção.** O runbook (docs/runbooks.md) manda aplicar só o
-- `01-taxonomias.sql` lá — este arquivo cria conta com senha conhecida, vaga
-- fictícia e evento sintético, e qualquer um dos três em produção é problema:
-- conta é porta de entrada, vaga é conteúdo falso indexado pelo Google e
-- evento contamina o painel de analytics com número que ninguém gerou.
--
-- Roda por `supabase db reset` (local e CI), depois do 01 pela ordem do glob
-- em `config.toml`.


-- ---------------------------------------------------------------------------
-- Empresas e vagas de exemplo
-- ---------------------------------------------------------------------------
--
-- Existem só para a listagem, os filtros e os testes terem o que exercitar.
-- Empresas e vagas são fictícias de propósito: dados inventados atribuídos a
-- empresas reais seriam enganosos se algum dia escapassem do ambiente local.
-- Este arquivo roda apenas em `supabase db reset` (local e CI).

insert into public.companies (name, slug, website) values
  ('Aurora Pagamentos', 'aurora-pagamentos', 'https://aurora.exemplo.test'),
  ('Verde Logística', 'verde-logistica', 'https://verde.exemplo.test'),
  ('Tucano Tech', 'tucano-tech', 'https://tucano.exemplo.test'),
  ('Maré Digital', 'mare-digital', 'https://mare.exemplo.test'),
  ('Cerrado Saúde', 'cerrado-saude', 'https://cerrado.exemplo.test'),
  ('Farol Educação', 'farol-educacao', 'https://farol.exemplo.test'),
  ('Bandeira Games', 'bandeira-games', 'https://bandeira.exemplo.test');

with dados (
  slug, title, company_slug, role_slug, seniority_slug, work_mode_slug,
  contract_slug, city, state, country, salary_min, salary_max, currency,
  status, dias_desde_publicacao, language, summary, description_md
) as (
  values
    ('pessoa-desenvolvedora-backend-aurora-pagamentos-a1b2c3',
     'Pessoa Desenvolvedora Backend', 'aurora-pagamentos', 'backend', 'senior',
     'remoto', 'clt', null, null, 'BR', 15000, 22000, 'BRL', 'published', 1, 'pt-BR',
     'Time de pagamentos instantâneos, com Go e Postgres em escala de milhões de transações por dia.',
     E'## Sobre a vaga\n\nVocê vai trabalhar no núcleo de pagamentos instantâneos, cuidando de serviços que processam milhões de transações por dia.\n\n## O que você vai fazer\n\n- Evoluir serviços em **Go** com foco em latência e confiabilidade\n- Modelar dados em **PostgreSQL** pensando em consistência financeira\n- Participar do plantão do time (escala justa, com compensação)\n\n## O que esperamos\n\n- Experiência com sistemas distribuídos em produção\n- Conforto com observabilidade: métricas, tracing e log estruturado'),

    ('pessoa-desenvolvedora-frontend-tucano-tech-b2c3d4',
     'Pessoa Desenvolvedora Frontend', 'tucano-tech', 'frontend', 'pleno',
     'hibrido', 'clt', 'São Paulo', 'SP', 'BR', 9000, 13000, 'BRL', 'published', 2, 'pt-BR',
     'Interface de um produto de dados usado por times de operação, em React e TypeScript.',
     E'## Sobre a vaga\n\nNosso produto de dados é usado todos os dias por times de operação. A interface precisa ser rápida e clara.\n\n## O que você vai fazer\n\n- Construir telas em **React** e **TypeScript**\n- Cuidar de acessibilidade e performance de verdade, não como checklist\n- Trabalhar lado a lado com design e produto\n\n## O que esperamos\n\n- Experiência com React em produto real\n- Gosto por CSS bem feito'),

    ('estagio-em-desenvolvimento-farol-educacao-c3d4e5',
     'Estágio em Desenvolvimento', 'farol-educacao', 'fullstack', 'estagio',
     'remoto', 'estagio', null, null, 'BR', 2200, 2200, 'BRL', 'published', 3, 'pt-BR',
     'Primeira experiência em tecnologia, com acompanhamento de pessoa mentora e sem exigência de experiência prévia.',
     E'## Sobre a vaga\n\nEsta é uma vaga para quem está começando. Não pedimos experiência anterior — pedimos vontade de aprender.\n\n## O que você vai fazer\n\n- Participar do desenvolvimento de funcionalidades pequenas, com apoio\n- Aprender **JavaScript**, **Node.js** e banco de dados na prática\n- Ter uma pessoa mentora dedicada e revisão de código gentil\n\n## O que esperamos\n\n- Estar cursando graduação ou curso técnico\n- Curiosidade e comunicação'),

    ('engenheiro-de-dados-verde-logistica-d4e5f6',
     'Engenharia de Dados', 'verde-logistica', 'data-engineer', 'pleno',
     'remoto', 'pj', null, null, 'BR', 12000, 16000, 'BRL', 'published', 4, 'pt-BR',
     'Pipelines de rastreamento de entregas com Python, Airflow e BigQuery.',
     E'## Sobre a vaga\n\nCada entrega gera eventos que precisam virar informação confiável para operação e clientes.\n\n## O que você vai fazer\n\n- Construir pipelines em **Python** orquestrados com **Airflow**\n- Modelar dados no **BigQuery** com **dbt**\n- Definir contratos de dados com os times que produzem os eventos'),

    ('pessoa-desenvolvedora-mobile-mare-digital-e5f6a7',
     'Pessoa Desenvolvedora Mobile', 'mare-digital', 'mobile', 'senior',
     'presencial', 'clt', 'Recife', 'PE', 'BR', 14000, 19000, 'BRL', 'published', 5, 'pt-BR',
     'Aplicativo de serviços náuticos em React Native, com uso offline em alto-mar.',
     E'## Sobre a vaga\n\nNosso aplicativo é usado em alto-mar, onde conexão é luxo. Offline-first não é enfeite: é requisito.\n\n## O que você vai fazer\n\n- Evoluir o app em **React Native**\n- Resolver sincronização e conflito de dados offline\n- Cuidar de bateria e consumo de rede'),

    ('sre-aurora-pagamentos-f6a7b8',
     'Site Reliability Engineering', 'aurora-pagamentos', 'sre', 'especialista',
     'remoto', 'clt', null, null, 'BR', 18000, 26000, 'BRL', 'published', 6, 'pt-BR',
     'Confiabilidade de uma plataforma financeira, com Kubernetes, Terraform e cultura de postmortem sem culpa.',
     E'## Sobre a vaga\n\nConfiabilidade aqui é requisito de negócio: quando o pagamento falha, alguém não recebe.\n\n## O que você vai fazer\n\n- Cuidar de clusters **Kubernetes** e infraestrutura como código com **Terraform**\n- Definir SLOs junto com os times de produto\n- Conduzir postmortems sem busca por culpado'),

    ('qa-automation-cerrado-saude-a7b8c9',
     'Pessoa de QA e Automação', 'cerrado-saude', 'qa', 'pleno',
     'hibrido', 'clt', 'Goiânia', 'GO', 'BR', 8000, 11000, 'BRL', 'published', 7, 'pt-BR',
     'Qualidade em sistemas de saúde, onde bug tem consequência clínica.',
     E'## Sobre a vaga\n\nEm software de saúde, um bug pode virar consequência clínica. Qualidade aqui tem peso.\n\n## O que você vai fazer\n\n- Escrever testes automatizados com **Cypress** e **pytest**\n- Trabalhar junto do time desde o refinamento, não só no fim\n- Cuidar de dados sensíveis com responsabilidade (LGPD)'),

    ('pessoa-desenvolvedora-fullstack-bandeira-games-b8c9d0',
     'Pessoa Desenvolvedora Fullstack', 'bandeira-games', 'fullstack', 'junior',
     'remoto', 'clt', null, null, 'BR', 6000, 8500, 'BRL', 'published', 8, 'pt-BR',
     'Ferramentas internas para times de criação de jogos, com Next.js e Node.',
     E'## Sobre a vaga\n\nNosso time de ferramentas existe para que quem cria jogos perca menos tempo com processo.\n\n## O que você vai fazer\n\n- Construir ferramentas internas com **Next.js** e **Node.js**\n- Conversar com quem usa a ferramenta todo dia\n- Aprender com revisão de código e pareamento'),

    ('devops-engineer-tucano-tech-c9d0e1',
     'Pessoa de DevOps', 'tucano-tech', 'devops', 'senior',
     'remoto', 'contractor', null, null, 'BR', null, null, null, 'published', 9, 'pt-BR',
     'Plataforma interna de deploy para dezenas de times, com foco em autonomia.',
     E'## Sobre a vaga\n\nA plataforma existe para que cada time consiga entregar sem depender de nós.\n\n## O que você vai fazer\n\n- Evoluir a plataforma interna sobre **Kubernetes** e **Argo CD**\n- Automatizar com **Terraform** e **GitHub Actions**\n- Tratar quem usa a plataforma como cliente'),

    ('machine-learning-engineer-verde-logistica-d0e1f2',
     'Machine Learning Engineer', 'verde-logistica', 'machine-learning', 'senior',
     'remoto', 'pj', null, null, 'BR', 16000, 24000, 'BRL', 'published', 10, 'en',
     'Route optimization models in production, with Python and PyTorch.',
     E'## About the role\n\nWe optimize delivery routes for thousands of drivers every day. Models here go to production, not to slides.\n\n## What you will do\n\n- Build and ship models with **Python** and **PyTorch**\n- Own the full lifecycle: training, deployment and monitoring\n- Work close to the operations team'),

    ('pessoa-desenvolvedora-backend-cerrado-saude-e1f2a3',
     'Pessoa Desenvolvedora Backend', 'cerrado-saude', 'backend', 'pleno',
     'hibrido', 'clt', 'Brasília', 'DF', 'BR', 10000, 14000, 'BRL', 'published', 12, 'pt-BR',
     'APIs de prontuário eletrônico em Java e Spring, com integrações do SUS.',
     E'## Sobre a vaga\n\nNosso prontuário eletrônico conversa com sistemas públicos de saúde. Integração aqui é o trabalho.\n\n## O que você vai fazer\n\n- Evoluir APIs em **Java** com **Spring Boot**\n- Integrar com sistemas legados sem quebrar quem depende deles\n- Cuidar de auditoria e rastreabilidade de acesso a dados clínicos'),

    ('designer-de-produto-mare-digital-f2a3b4',
     'Design de Produto', 'mare-digital', 'design', 'pleno',
     'remoto', 'clt', null, null, 'BR', 9000, 12000, 'BRL', 'published', 14, 'pt-BR',
     'Design de produto com pesquisa junto de quem usa, em um time pequeno e autônomo.',
     E'## Sobre a vaga\n\nTime pequeno, decisões perto de quem usa o produto.\n\n## O que você vai fazer\n\n- Conduzir pesquisa e transformar achado em decisão de produto\n- Manter e evoluir nosso design system no **Figma**\n- Trabalhar junto do desenvolvimento desde o começo'),

    ('pessoa-desenvolvedora-python-farol-educacao-a3b4c5',
     'Pessoa Desenvolvedora Python', 'farol-educacao', 'backend', 'junior',
     'remoto', 'clt', null, null, 'BR', 5500, 7500, 'BRL', 'archived', 45, 'pt-BR',
     'Plataforma de ensino a distância com Django, para escolas públicas.',
     E'## Sobre a vaga\n\nNossa plataforma atende escolas públicas. O que fazemos chega em lugar com internet ruim e computador antigo.\n\n## O que você vai fazer\n\n- Evoluir a plataforma em **Python** com **Django**\n- Otimizar para conexões lentas\n- Aprender com pareamento e revisão'),

    ('arquiteto-de-solucoes-aurora-pagamentos-b4c5d6',
     'Arquitetura de Soluções', 'aurora-pagamentos', 'cloud', 'principal',
     'hibrido', 'clt', 'São Paulo', 'SP', 'BR', 25000, 35000, 'BRL', 'archived', 60, 'pt-BR',
     'Arquitetura de plataforma financeira multi-cloud, com AWS e Azure.',
     E'## Sobre a vaga\n\nDecisões de arquitetura aqui duram anos e afetam dezenas de times.\n\n## O que você vai fazer\n\n- Desenhar arquitetura sobre **AWS** e **Azure**\n- Escrever ADRs e defender decisões em revisão\n- Formar outras pessoas na organização'),

    ('suporte-tecnico-bandeira-games-c5d6e7',
     'Suporte Técnico', 'bandeira-games', 'suporte', 'junior',
     'presencial', 'clt', 'Porto Alegre', 'RS', 'BR', 3500, 4800, 'BRL', 'archived', 50, 'pt-BR',
     'Atendimento técnico a estúdios parceiros, com foco em diagnóstico.',
     E'## Sobre a vaga\n\nEstúdios parceiros dependem da nossa ferramenta para entregar. Quando trava, você é quem destrava.\n\n## O que você vai fazer\n\n- Diagnosticar problemas em **Linux** e redes\n- Documentar cada caso para virar melhoria de produto\n- Escalar o que não for possível resolver na hora')
)
insert into public.jobs (
  slug, title, company_id, description_md, summary,
  role_category_id, seniority_id, work_mode_id, contract_type_id,
  location_city, location_state, location_country,
  salary_min, salary_max, salary_currency,
  source_url, source_url_hash, source_site, apply_url,
  status, published_at, expires_at, language, keywords
)
select
  d.slug,
  d.title,
  c.id,
  d.description_md,
  d.summary,
  rc.id,
  sl.id,
  wm.id,
  ct.id,
  d.city,
  d.state,
  d.country::char(2),
  d.salary_min::numeric(12, 2),
  d.salary_max::numeric(12, 2),
  d.currency::char(3),
  'https://' || d.company_slug || '.exemplo.test/vagas/' || d.slug,
  -- sha256 da URL de verdade, e não um valor de fachada: é a chave de dedup
  -- (doc 04), e com um placeholder aqui reimportar uma vaga do seed criaria
  -- duplicata em vez de ser recusada. As URLs acima já são canônicas, então o
  -- hash bate com o que `hashDaUrl` calcula na aplicação.
  encode(
    extensions.digest(
      'https://' || d.company_slug || '.exemplo.test/vagas/' || d.slug,
      'sha256'
    ),
    'hex'
  ),
  'generic',
  'https://' || d.company_slug || '.exemplo.test/vagas/' || d.slug || '/candidatar',
  d.status::public.job_status,
  now() - (d.dias_desde_publicacao || ' days')::interval,
  now() - (d.dias_desde_publicacao || ' days')::interval + interval '30 days',
  d.language,
  string_to_array(d.role_slug || ',' || d.seniority_slug || ',' || d.work_mode_slug, ',')
from dados d
join public.companies c on c.slug = d.company_slug
left join public.role_categories rc on rc.slug = d.role_slug
left join public.seniority_levels sl on sl.slug = d.seniority_slug
left join public.work_modes wm on wm.slug = d.work_mode_slug
left join public.contract_types ct on ct.slug = d.contract_slug;

-- Tecnologias por vaga: a primeira de cada lista é a principal do card.
with vinculos (job_slug, tech_slugs) as (
  values
    ('pessoa-desenvolvedora-backend-aurora-pagamentos-a1b2c3', 'go,postgresql,kubernetes,docker'),
    ('pessoa-desenvolvedora-frontend-tucano-tech-b2c3d4', 'react,typescript,nextjs,tailwindcss'),
    ('estagio-em-desenvolvimento-farol-educacao-c3d4e5', 'javascript,nodejs,postgresql'),
    ('engenheiro-de-dados-verde-logistica-d4e5f6', 'python,airflow,bigquery,dbt'),
    ('pessoa-desenvolvedora-mobile-mare-digital-e5f6a7', 'react-native,typescript,sqlite'),
    ('sre-aurora-pagamentos-f6a7b8', 'kubernetes,terraform,prometheus,grafana,aws'),
    ('qa-automation-cerrado-saude-a7b8c9', 'cypress,pytest,python,postgresql'),
    ('pessoa-desenvolvedora-fullstack-bandeira-games-b8c9d0', 'nextjs,nodejs,typescript,postgresql'),
    ('devops-engineer-tucano-tech-c9d0e1', 'kubernetes,argocd,terraform,github-actions'),
    ('machine-learning-engineer-verde-logistica-d0e1f2', 'python,pytorch,gcp,docker'),
    ('pessoa-desenvolvedora-backend-cerrado-saude-e1f2a3', 'java,spring-boot,oracle-db,docker'),
    ('designer-de-produto-mare-digital-f2a3b4', 'figma'),
    ('pessoa-desenvolvedora-python-farol-educacao-a3b4c5', 'python,django,postgresql'),
    ('arquiteto-de-solucoes-aurora-pagamentos-b4c5d6', 'aws,azure,kubernetes,terraform'),
    ('suporte-tecnico-bandeira-games-c5d6e7', 'linux,git')
)
insert into public.job_technologies (job_id, technology_id, is_primary)
select
  j.id,
  t.id,
  tech.ordinality <= 3
from vinculos v
join public.jobs j on j.slug = v.job_slug
cross join lateral unnest(string_to_array(v.tech_slugs, ',')) with ordinality as tech(slug, ordinality)
join public.technologies t on t.slug = tech.slug;

with etiquetas (job_slug, tag_slugs) as (
  values
    ('pessoa-desenvolvedora-backend-aurora-pagamentos-a1b2c3', 'fintech'),
    ('sre-aurora-pagamentos-f6a7b8', 'fintech'),
    ('estagio-em-desenvolvimento-farol-educacao-c3d4e5', 'primeiro-emprego'),
    ('pessoa-desenvolvedora-fullstack-bandeira-games-b8c9d0', 'primeiro-emprego,startup'),
    ('machine-learning-engineer-verde-logistica-d0e1f2', 'internacional'),
    ('designer-de-produto-mare-digital-f2a3b4', 'startup')
)
insert into public.job_tags (job_id, tag_id)
select j.id, t.id
from etiquetas e
join public.jobs j on j.slug = e.job_slug
cross join lateral unnest(string_to_array(e.tag_slugs, ',')) as tag(slug)
join public.tags t on t.slug = tag.slug;

-- ---------------------------------------------------------------------------
-- Eventos de exemplo para o painel de analytics
-- ---------------------------------------------------------------------------
--
-- Sem eles o dashboard do doc 09 abre com todos os números em zero, e quem for
-- mexer nos widgets não tem como ver o que está construindo. São sintéticos e
-- só existem no reset local — em produção quem escreve aqui é o beacon.
--
-- O volume varia por vaga e por dia de propósito: uma série reta esconderia
-- erro de agrupamento, e um CTR constante esconderia divisão errada.

with dias as (
  select generate_series(
    (now() at time zone 'utc')::date - 45,
    (now() at time zone 'utc')::date - 1,
    interval '1 day'
  )::date as dia
),
vagas as (
  select id, row_number() over (order by slug) as posicao
    from public.jobs
   where status = 'published'
),
origens (rotulo, utm, referrer) as (
  values
    ('discord', 'discord', null),
    ('whatsapp', 'whatsapp', null),
    ('google', null, 'https://www.google.com/search?q=vagas+backend'),
    ('linkedin', 'linkedin', null),
    ('direto', null, null)
),
visitas as (
  select
    v.id as job_id,
    d.dia,
    o.utm,
    o.referrer,
    -- Determinístico: o mesmo reset produz o mesmo painel, e comparar duas
    -- execuções continua fazendo sentido.
    generate_series(1, 1 + ((v.posicao * 7 + extract(doy from d.dia)::int) % 9)) as n,
    o.rotulo
  from dias d
  cross join vagas v
  join origens o
    on o.rotulo = (array['discord','whatsapp','google','linkedin','direto'])[
         1 + ((v.posicao + extract(doy from d.dia)::int) % 5)
       ]
)
insert into public.job_events (job_id, event_type, occurred_at, occurred_on, referrer, utm_source, visitor_hash)
select
  job_id,
  'view'::public.event_type,
  dia + time '13:00' + (n * interval '3 minutes'),
  dia,
  referrer,
  utm,
  -- Um hash por visita: o índice de dedup conta uma ação por visitante/dia.
  encode(sha256(('seed-' || job_id::text || dia::text || n::text)::bytea), 'hex')
from visitas;

-- Cliques: uma fração das visitas, com divisor diferente por vaga para o CTR
-- sair diferente de zero e diferente entre vagas. O primeiro byte do hash faz
-- o papel do sorteio, sem depender de `random()` — o painel de dois resets
-- seguidos precisa ser o mesmo.
insert into public.job_events (job_id, event_type, occurred_at, occurred_on, referrer, utm_source, visitor_hash)
select e.job_id, 'click_apply'::public.event_type, e.occurred_at + interval '2 minutes',
       e.occurred_on, e.referrer, e.utm_source, e.visitor_hash
  from public.job_events e
  join (
    select id, row_number() over (order by slug) as posicao
      from public.jobs
     where status = 'published'
  ) v on v.id = e.job_id
 where e.event_type = 'view'
   and e.occurred_on < (now() at time zone 'utc')::date
   and ('x' || substr(e.visitor_hash, 1, 2))::bit(8)::int % (3 + v.posicao) = 0;

-- Agrega o que acabou de nascer: o painel lê `job_stats_daily`, não os eventos
-- crus, e o cron do rollup só roda às 03:30 UTC.
do $$
declare
  d date;
begin
  for d in
    select distinct occurred_on from public.job_events order by 1
  loop
    perform public.rollup_job_stats(d);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usuários de desenvolvimento, um por papel
-- ---------------------------------------------------------------------------
--
-- Existem apenas aqui, e este arquivo só roda em `supabase db reset` (local e
-- CI) — nunca em produção, onde papéis são promovidos manualmente por um admin.
--
-- Senha de todos: cfjobs-local
--   admin@cfjobs.local · editor@cfjobs.local · moderator@cfjobs.local ·
--   reader@cfjobs.local
--
-- Um por papel porque a matriz de autorização do doc 07 só é testável de
-- verdade com sessão de verdade: os testes de integração das Server Actions
-- entram pelo mesmo login de senha que uma pessoa usaria.

do $$
declare
  pessoa record;
begin
  for pessoa in
    select *
      from (values
        ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@cfjobs.local', 'Admin Local', 'admin'),
        ('00000000-0000-4000-8000-000000000002'::uuid, 'editor@cfjobs.local', 'Editor Local', 'editor'),
        ('00000000-0000-4000-8000-000000000003'::uuid, 'moderator@cfjobs.local', 'Moderação Local', 'moderator'),
        ('00000000-0000-4000-8000-000000000004'::uuid, 'reader@cfjobs.local', 'Leitor Local', 'reader')
      ) as t(id, email, nome, papel)
  loop
    -- As colunas de token precisam de string vazia: o serviço de auth lê todas
    -- como texto não nulo e falha com "Database error querying schema" se
    -- vierem NULL.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      pessoa.id,
      'authenticated',
      'authenticated',
      pessoa.email,
      extensions.crypt('cfjobs-local', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', pessoa.nome),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      pessoa.id::text,
      pessoa.id,
      jsonb_build_object('sub', pessoa.id::text, 'email', pessoa.email),
      'email',
      now(), now(), now()
    );

    -- O trigger handle_new_user() criou o perfil como `reader`.
    update public.profiles
       set role = pessoa.papel::public.user_role
     where id = pessoa.id;
  end loop;
end;
$$;
