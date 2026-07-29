-- 0011 — Poda dos eventos crus (doc 09)
--
-- O doc 09 promete que `job_events` é podado após 90 dias e que "agregados são
-- eternos". A metade agregadora existia desde o 0007 (`rollup_job_stats`); a
-- poda faltava, e sem ela a tabela append-only cresce para sempre guardando o
-- que o `job_stats_daily` já resume.
--
-- Só apaga o que já foi agregado: um dia sem linha em `job_stats_daily` é um
-- dia que o rollup não processou, e jogá-lo fora perderia o número em vez de
-- economizar espaço. Se o cron do rollup ficar dias fora do ar, a poda espera.

create function public.prune_job_events(retention_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  corte date := (now() at time zone 'utc')::date - retention_days;
  removed integer;
begin
  delete from public.job_events e
   where e.occurred_on < corte
     and exists (
       select 1
         from public.job_stats_daily s
        where s.job_id = e.job_id
          and s.day = e.occurred_on
     );

  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.prune_job_events(integer) is
  'Apaga eventos crus com mais de N dias que já foram agregados em job_stats_daily (doc 09).';

-- Domingo 04:15 — depois do `cleanup_imports` das 04:00, para as duas varreduras
-- de manutenção não disputarem a mesma janela.
select cron.schedule(
  'cfjobs-prune-job-events',
  '15 4 * * 0',
  $$select public.prune_job_events()$$
);
