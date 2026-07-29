-- 0002 — Enums de sistema (doc 04)
--
-- São estados internos imutáveis: não têm CRUD administrativo e por isso são
-- enums, não tabelas de lookup. Cadastros que o admin gerencia estão em 0003.

create type public.user_role as enum ('admin', 'editor', 'moderator', 'reader');

create type public.job_status as enum (
  'draft',
  'pending_review',
  'published',
  'archived',
  'rejected'
);

create type public.import_status as enum (
  'queued',
  'fetching',
  'extracting',
  'classifying',
  'mapping',
  'review',
  'completed',
  'failed'
);

create type public.technology_kind as enum (
  'language',
  'framework',
  'database',
  'cloud',
  'tool'
);

create type public.salary_period as enum ('hour', 'month', 'year');

create type public.event_type as enum ('view', 'click_apply', 'share');

create type public.suggestion_status as enum (
  'pending',
  'approved',
  'rejected',
  'merged'
);
