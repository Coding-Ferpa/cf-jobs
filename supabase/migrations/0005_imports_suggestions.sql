-- 0005 — Fila de importação e sugestões de taxonomia (docs 04 e 05)

-- Cada tentativa de importação vira uma linha: é a fila, o cache do conteúdo
-- bruto e o registro de observabilidade do pipeline, tudo no mesmo lugar.
create table public.job_imports (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  url_hash text not null,
  status public.import_status not null default 'queued',
  source_site text,

  -- Cache de 24h do conteúdo extraído; o cron limpa após 7 dias.
  raw_content text,
  ai_response jsonb,

  error_step text,
  error_message text,

  model text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  attempt integer not null default 1,

  job_id uuid references public.jobs (id) on delete set null,
  requested_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  finished_at timestamptz,

  constraint job_imports_attempt_check check (attempt >= 1)
);

-- Dedup e reaproveitamento de cache partem da URL canonicalizada.
create index job_imports_url_hash_idx on public.job_imports (url_hash, created_at desc);
create index job_imports_status_idx on public.job_imports (status, created_at desc);
create index job_imports_job_idx on public.job_imports (job_id);

-- Termo que a IA extraiu e não existe nas lookups: entra em fila humana em vez
-- de virar cadastro automático.
create table public.taxonomy_suggestions (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  suggested_label text not null,
  normalized_slug text not null,
  -- Trecho da vaga que originou a sugestão, para quem revisa ter contexto.
  context text,
  import_id uuid references public.job_imports (id) on delete set null,
  status public.suggestion_status not null default 'pending',
  -- Sem FK: aponta para a lookup de `kind`, que varia por linha.
  resolved_taxonomy_id uuid,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,

  constraint taxonomy_suggestions_kind_check check (
    kind in (
      'technology',
      'tag',
      'role_category',
      'seniority_level',
      'work_mode',
      'contract_type'
    )
  ),
  constraint taxonomy_suggestions_resolved_check check (
    status = 'pending' or reviewed_at is not null
  )
);

-- O mesmo termo desconhecido em dez vagas gera uma sugestão pendente, não dez.
create unique index taxonomy_suggestions_pending_idx
  on public.taxonomy_suggestions (kind, normalized_slug)
  where status = 'pending';

create index taxonomy_suggestions_status_idx
  on public.taxonomy_suggestions (status, created_at desc);
