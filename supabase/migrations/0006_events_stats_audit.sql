-- 0006 — Eventos, agregados, auditoria e rate limit (docs 04, 06, 07 e 09)

-- Analytics first-party. Sem FK para profiles e sem IP: o visitante é
-- identificado por um hash irreversível que rotaciona a cada dia (LGPD).
create table public.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  event_type public.event_type not null,
  occurred_at timestamptz not null default now(),
  -- Dia do evento em UTC, materializado no insert: `timestamptz at time zone`
  -- não é imutável e por isso não serve em coluna gerada nem em índice.
  occurred_on date not null default ((now() at time zone 'utc')::date),
  referrer text,
  utm_source text,
  visitor_hash text
);

create index job_events_job_idx on public.job_events (job_id, occurred_at);
-- Varredura por período do rollup: BRIN custa quase nada em tabela append-only.
create index job_events_occurred_brin_idx on public.job_events using brin (occurred_at);

-- Contagem honesta: o mesmo visitante repetindo a mesma ação no mesmo dia
-- conta uma vez (doc 06).
create unique index job_events_dedup_idx
  on public.job_events (job_id, event_type, visitor_hash, occurred_on)
  where visitor_hash is not null;

-- Agregado noturno que alimenta o dashboard e os contadores da vaga.
create table public.job_stats_daily (
  job_id uuid not null references public.jobs (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  clicks integer not null default 0,
  shares integer not null default 0,
  primary key (job_id, day)
);

create index job_stats_daily_day_idx on public.job_stats_daily (day desc);

-- Toda mutation do admin deixa rastro. Insert-only: a RLS de 0008 não concede
-- update nem delete a ninguém.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  -- Antes/depois apenas dos campos alterados.
  diff jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- Rate limit por janela deslizante, sem Redis (doc 07). A chave é um hash: nunca
-- guardamos IP em claro.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (key, window_start)
);

create index rate_limits_window_idx on public.rate_limits (window_start);
