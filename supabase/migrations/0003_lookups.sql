-- 0003 — Tabelas de lookup (doc 04)
--
-- Cadastros que o admin gerencia e a IA seleciona. Todas compartilham a mesma
-- forma: slug estável (contrato com a URL e com a IA), label exibido, aliases
-- para matching e is_active para desativar sem apagar histórico.
--
-- `technologies` é uma tabela só, com `kind`, em vez de uma por categoria: o
-- comportamento é idêntico e a fronteira entre as categorias é fluida.

create table public.role_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.seniority_levels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  -- Ordena de estágio a principal; usado em filtros por faixa.
  rank integer not null,
  created_at timestamptz not null default now()
);

create table public.work_modes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.contract_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.technologies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  kind public.technology_kind not null,
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Matching da IA: procura o termo extraído entre os aliases de cada lookup.
create index role_categories_aliases_idx on public.role_categories using gin (aliases);
create index seniority_levels_aliases_idx on public.seniority_levels using gin (aliases);
create index work_modes_aliases_idx on public.work_modes using gin (aliases);
create index contract_types_aliases_idx on public.contract_types using gin (aliases);
create index technologies_aliases_idx on public.technologies using gin (aliases);
create index tags_aliases_idx on public.tags using gin (aliases);

-- Fallback por similaridade quando não há acerto exato nem por alias.
create index technologies_label_trgm_idx on public.technologies using gin (label extensions.gin_trgm_ops);
create index tags_label_trgm_idx on public.tags using gin (label extensions.gin_trgm_ops);

create index technologies_kind_idx on public.technologies (kind) where is_active;
