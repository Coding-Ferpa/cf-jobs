import 'server-only'

import { sql } from 'drizzle-orm'

import { db } from '@/db/client'
import type { ExecucaoDeCron } from '@/features/analytics/painel'
import type { Periodo } from '@/lib/analytics-periodos'

/**
 * Leituras do painel de analytics (doc 09).
 *
 * A fonte de cada widget é a que o doc 09 fixa, e a distinção importa:
 * engajamento, série e tops saem de **`job_stats_daily`** — o agregado que o
 * rollup escreve —, e origem de visitante sai de **`job_events`**, porque
 * referrer e utm não sobrevivem à agregação.
 *
 * Consequência que a tela precisa dizer em voz alta: o agregado vai até
 * ontem. O rollup roda às 03:30 UTC, então o dia corrente só aparece depois. É
 * melhor um número honesto e datado do que somar eventos crus por cima e
 * entregar uma série que muda de definição no último ponto.
 *
 * SQL cru onde a agregação é o assunto: `filter (where ...)` e `sum` sobre
 * junção lida melhor assim do que montado pelo query builder.
 */

export type ResumoDeEngajamento = {
  views: number
  clicks: number
  shares: number
  /** Último dia com agregado; `null` quando o rollup nunca rodou. */
  ultimoDia: string | null
}

export async function resumoDeEngajamento(dias: Periodo): Promise<ResumoDeEngajamento> {
  const linhas = await db.execute<{
    views: number
    clicks: number
    shares: number
    ultimo_dia: string | null
  }>(sql`
    select coalesce(sum(views), 0)::int as views,
           coalesce(sum(clicks), 0)::int as clicks,
           coalesce(sum(shares), 0)::int as shares,
           max(day)::text as ultimo_dia
      from public.job_stats_daily
     where day > (now() at time zone 'utc')::date - ${dias}::int
  `)

  const linha = (
    linhas as unknown as {
      views: number
      clicks: number
      shares: number
      ultimo_dia: string | null
    }[]
  ).at(0)

  return {
    views: linha?.views ?? 0,
    clicks: linha?.clicks ?? 0,
    shares: linha?.shares ?? 0,
    ultimoDia: linha?.ultimo_dia ?? null,
  }
}

export type PontoDaSerie = { dia: string; views: number; clicks: number }

/**
 * Série diária sem buraco: `generate_series` garante um ponto por dia, e dia
 * sem evento vale zero. Sem isso o gráfico ligaria segunda a quinta como se
 * nada tivesse acontecido no meio.
 */
export async function serieDiaria(dias: Periodo): Promise<PontoDaSerie[]> {
  const linhas = await db.execute<{ dia: string; views: number; clicks: number }>(sql`
    with calendario as (
      select generate_series(
        (now() at time zone 'utc')::date - ${dias}::int + 1,
        (now() at time zone 'utc')::date,
        interval '1 day'
      )::date as dia
    )
    select c.dia::text as dia,
           coalesce(sum(s.views), 0)::int as views,
           coalesce(sum(s.clicks), 0)::int as clicks
      from calendario c
      left join public.job_stats_daily s on s.day = c.dia
     group by c.dia
     order by c.dia
  `)

  return linhas as unknown as PontoDaSerie[]
}

export type VagaEmDestaque = {
  id: string
  slug: string
  title: string
  companyName: string
  views: number
  clicks: number
}

export async function topVagas(dias: Periodo, limite = 10): Promise<VagaEmDestaque[]> {
  const linhas = await db.execute<VagaEmDestaque>(sql`
    select j.id, j.slug, j.title, e.name as "companyName",
           sum(s.views)::int as views,
           sum(s.clicks)::int as clicks
      from public.job_stats_daily s
      join public.jobs j on j.id = s.job_id
      join public.companies e on e.id = j.company_id
     where s.day > (now() at time zone 'utc')::date - ${dias}::int
     group by j.id, j.slug, j.title, e.name
    having sum(s.views) > 0
     order by sum(s.views) desc, j.title
     limit ${limite}
  `)

  return linhas as unknown as VagaEmDestaque[]
}

export type EmpresaEmDestaque = {
  name: string
  slug: string
  vagas: number
  views: number
  clicks: number
}

export async function topEmpresas(
  dias: Periodo,
  limite = 10,
): Promise<EmpresaEmDestaque[]> {
  const linhas = await db.execute<EmpresaEmDestaque>(sql`
    select e.name, e.slug,
           count(distinct j.id)::int as vagas,
           sum(s.views)::int as views,
           sum(s.clicks)::int as clicks
      from public.job_stats_daily s
      join public.jobs j on j.id = s.job_id
      join public.companies e on e.id = j.company_id
     where s.day > (now() at time zone 'utc')::date - ${dias}::int
     group by e.id, e.name, e.slug
    having sum(s.views) > 0
     order by sum(s.views) desc, e.name
     limit ${limite}
  `)

  return linhas as unknown as EmpresaEmDestaque[]
}

export type TecnologiaEmDestaque = {
  label: string
  slug: string
  views: number
  vagas: number
}

/**
 * "Tecnologias procuradas" é a soma das views das vagas que a citam (doc 09).
 * Uma view conta para todas as tecnologias da vaga — quem abriu um anúncio de
 * Go com Postgres demonstrou interesse nos dois, e o total por tecnologia não
 * deve ser lido como fatia de um bolo.
 */
export async function topTecnologias(
  dias: Periodo,
  limite = 10,
): Promise<TecnologiaEmDestaque[]> {
  const linhas = await db.execute<TecnologiaEmDestaque>(sql`
    select t.label, t.slug,
           sum(s.views)::int as views,
           count(distinct j.id)::int as vagas
      from public.job_stats_daily s
      join public.jobs j on j.id = s.job_id
      join public.job_technologies jt on jt.job_id = j.id
      join public.technologies t on t.id = jt.technology_id
     where s.day > (now() at time zone 'utc')::date - ${dias}::int
     group by t.id, t.label, t.slug
    having sum(s.views) > 0
     order by sum(s.views) desc, t.label
     limit ${limite}
  `)

  return linhas as unknown as TecnologiaEmDestaque[]
}

export type TagEmUso = { label: string; slug: string; vagas: number }

/** Tags mais usadas: contagem de `job_tags`, não de views (doc 09). */
export async function topTags(limite = 10): Promise<TagEmUso[]> {
  const linhas = await db.execute<TagEmUso>(sql`
    select t.label, t.slug, count(jt.job_id)::int as vagas
      from public.tags t
      join public.job_tags jt on jt.tag_id = t.id
      join public.jobs j on j.id = jt.job_id
     where j.status = 'published'
     group by t.id, t.label, t.slug
     order by count(jt.job_id) desc, t.label
     limit ${limite}
  `)

  return linhas as unknown as TagEmUso[]
}

export type Origem = { origem: string; eventos: number }

/**
 * De onde vem quem visita (doc 09). O `utm_source` manda quando existe, porque
 * é o que a comunidade controla ao divulgar; sem ele, o host do referrer — o
 * caminho completo só multiplicaria linhas iguais.
 *
 * Sai de `job_events` e não do agregado: referrer e utm não sobrevivem ao
 * rollup, e por isso esta é a única leitura do painel que enxerga o dia
 * corrente.
 */
export async function origemDeVisitantes(dias: Periodo, limite = 8): Promise<Origem[]> {
  const linhas = await db.execute<Origem>(sql`
    select coalesce(
             nullif(btrim(utm_source), ''),
             nullif(regexp_replace(coalesce(referrer, ''), '^https?://(www\\.)?([^/?#]+).*$', '\\2'), ''),
             'direto'
           ) as origem,
           count(*)::int as eventos
      from public.job_events
     where occurred_at > now() - make_interval(days => ${dias}::int)
     group by 1
     order by count(*) desc, 1
     limit ${limite}
  `)

  return linhas as unknown as Origem[]
}

export type ImportacoesRecentes = { total: number; falhas: number }

/** Janela de 24h do badge de saúde (doc 09) — não a de 30 dias do painel. */
export async function importacoesDasUltimas24h(): Promise<ImportacoesRecentes> {
  const linhas = await db.execute<ImportacoesRecentes>(sql`
    select count(*)::int as total,
           count(*) filter (where status = 'failed')::int as falhas
      from public.job_imports
     where created_at > now() - interval '24 hours'
  `)

  const linha = (linhas as unknown as ImportacoesRecentes[]).at(0)
  return { total: linha?.total ?? 0, falhas: linha?.falhas ?? 0 }
}

/** Nome do job no pg_cron que o doc 09 manda vigiar (migration 0009). */
export const CRON_DE_ARQUIVAMENTO = 'cfjobs-archive-expired-jobs'

/**
 * Última execução do cron de arquivamento. Devolve `null` — e não um erro —
 * quando não dá para ler `cron.job_run_details`: o schema `cron` pertence ao
 * banco e a permissão depende do papel da conexão, então um painel que
 * quebrasse por isso trocaria quatro badges por uma tela de erro.
 */
export async function ultimaExecucaoDoCron(
  jobname = CRON_DE_ARQUIVAMENTO,
): Promise<ExecucaoDeCron | null> {
  try {
    const linhas = await db.execute<{ end_time: Date | null; status: string | null }>(sql`
      select d.end_time, d.status
        from cron.job j
        left join cron.job_run_details d on d.jobid = j.jobid
       where j.jobname = ${jobname}
       order by d.end_time desc nulls last
       limit 1
    `)

    const linha = (
      linhas as unknown as { end_time: Date | string | null; status: string | null }[]
    ).at(0)

    // A consulta funcionou e não há linha: o job não está agendado. Do ponto de
    // vista de quem opera é o mesmo problema de nunca ter rodado — vai olhar o
    // pg_cron do mesmo jeito —, e é o que `avaliarSaude` reporta.
    if (!linha) return { ultimaExecucao: null, ultimoStatus: null }

    return {
      ultimaExecucao: linha.end_time ? new Date(linha.end_time) : null,
      ultimoStatus: linha.status,
    }
  } catch (erro) {
    console.error('[analytics] não foi possível ler o histórico do pg_cron', erro)
    return null
  }
}
