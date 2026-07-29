-- 0004 — Perfis, empresas, vagas e junções (doc 04)

-- Espelho de auth.users com o papel do usuário. Preenchido pelo trigger
-- handle_new_user() (migration 0007); todo usuário novo nasce `reader`.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role public.user_role not null default 'reader',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  website text,
  logo_url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A IA cria empresas automaticamente: o match acontece por nome normalizado,
-- então a unicidade precisa ignorar caixa.
create unique index companies_name_lower_idx on public.companies (lower(name));
create index companies_name_trgm_idx on public.companies using gin (name extensions.gin_trgm_ops);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  company_id uuid not null references public.companies (id) on delete restrict,
  description_md text not null,
  summary text,

  -- Nulos quando a IA não tem confiança: a revisão humana preenche.
  role_category_id uuid references public.role_categories (id) on delete set null,
  seniority_id uuid references public.seniority_levels (id) on delete set null,
  work_mode_id uuid references public.work_modes (id) on delete set null,
  contract_type_id uuid references public.contract_types (id) on delete set null,

  location_city text,
  location_state text,
  location_country char(2),

  salary_min numeric(12, 2),
  salary_max numeric(12, 2),
  salary_currency char(3),
  salary_period public.salary_period not null default 'month',

  benefits text[] not null default '{}',
  keywords text[] not null default '{}',
  language text not null default 'pt-BR',

  source_url text not null,
  -- sha256 da URL canonicalizada: é o que impede importar a mesma vaga duas vezes.
  source_url_hash text not null unique,
  source_site text,
  apply_url text not null,

  status public.job_status not null default 'draft',
  published_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,

  -- Denormalizados pelo rollup diário para a listagem não somar eventos ao vivo.
  views_count integer not null default 0,
  clicks_count integer not null default 0,

  -- Mantido pelo trigger jobs_search_update() (0007): depende do nome da
  -- empresa, então não pode ser coluna gerada.
  search tsvector,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jobs_title_length_check check (char_length(title) between 3 and 200),
  constraint jobs_salary_range_check check (
    salary_min is null or salary_max is null or salary_max >= salary_min
  ),
  constraint jobs_salary_positive_check check (
    (salary_min is null or salary_min >= 0) and (salary_max is null or salary_max >= 0)
  ),
  constraint jobs_country_iso_check check (
    location_country is null or location_country ~ '^[A-Z]{2}$'
  ),
  constraint jobs_currency_iso_check check (
    salary_currency is null or salary_currency ~ '^[A-Z]{3}$'
  ),
  constraint jobs_published_has_date_check check (
    status <> 'published' or published_at is not null
  )
);

create table public.job_technologies (
  job_id uuid not null references public.jobs (id) on delete cascade,
  technology_id uuid not null references public.technologies (id) on delete cascade,
  -- Até três destacadas no card da vaga.
  is_primary boolean not null default false,
  primary key (job_id, technology_id)
);

create table public.job_tags (
  job_id uuid not null references public.jobs (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (job_id, tag_id)
);

-- Listagem padrão: publicadas, mais recentes primeiro.
create index jobs_published_recent_idx on public.jobs (status, published_at desc)
  where status = 'published';
-- Varredura do cron de arquivamento.
create index jobs_expiring_idx on public.jobs (expires_at) where status = 'published';

create index jobs_search_idx on public.jobs using gin (search);
create index jobs_keywords_idx on public.jobs using gin (keywords);

create index jobs_company_idx on public.jobs (company_id);
create index jobs_role_category_idx on public.jobs (role_category_id);
create index jobs_seniority_idx on public.jobs (seniority_id);
create index jobs_work_mode_idx on public.jobs (work_mode_id);
create index jobs_contract_type_idx on public.jobs (contract_type_id);

-- Ordem invertida da PK: o filtro parte da tecnologia para chegar nas vagas.
create index job_technologies_technology_idx on public.job_technologies (technology_id, job_id);
create index job_tags_tag_idx on public.job_tags (tag_id, job_id);
