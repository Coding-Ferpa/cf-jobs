-- 0009 — Agendamentos pg_cron (doc 04)
--
-- Rodam dentro do banco: funcionam mesmo com a Vercel fora do ar e não custam
-- cold start. Os horários estão em UTC.
--
-- `cron.schedule` é upsert por nome, então reaplicar a migration não duplica.

-- 03:00 — arquiva as publicadas que venceram e avisa a Vercel para revalidar.
select cron.schedule(
  'cfjobs-archive-expired-jobs',
  '0 3 * * *',
  $$select public.archive_expired_jobs()$$
);

-- 03:30 — agrega os eventos do dia anterior (roda depois do arquivamento).
select cron.schedule(
  'cfjobs-rollup-job-stats',
  '30 3 * * *',
  $$select public.rollup_job_stats()$$
);

-- Domingo 04:00 — descarta o conteúdo bruto de importações antigas.
select cron.schedule(
  'cfjobs-cleanup-imports',
  '0 4 * * 0',
  $$select public.cleanup_imports()$$
);

-- O refresh de mv_facet_counts entra junto com a materialized view, que só
-- nasce quando o P95 da home passar de 300ms (doc 10).
