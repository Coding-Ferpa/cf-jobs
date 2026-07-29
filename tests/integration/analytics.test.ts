import { and, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/db/client'
import { jobEvents, jobStatsDaily, jobs } from '@/db/schema'

/**
 * O rollup e a poda do doc 09 contra o banco de verdade.
 *
 * São funções SQL que ninguém vê rodar: o pg_cron as chama de madrugada, e o
 * único sinal de que fizeram a coisa certa é o número no painel. Um `group by`
 * errado aqui não quebra nada — só mente para sempre.
 *
 * Os eventos são plantados em dias antigos e com `visitor_hash` próprio para
 * não colidir com o índice de dedup nem com o que a área pública gravou.
 */

const VISITANTE = 'analytics-integracao'

/** Dias fixos e bem no passado: fora da janela de qualquer outra suíte. */
const DIA = '2023-03-15'
const DIA_ANTERIOR = '2023-03-14'
const DIA_ANTIGO = '2020-01-10'

let jobId: string
let contadoresOriginais: { views: number; clicks: number }

async function plantarEvento(entrada: {
  dia: string
  tipo: 'view' | 'click_apply' | 'share'
  visitante: string
  referrer?: string
  utmSource?: string
}) {
  await db.insert(jobEvents).values({
    jobId,
    eventType: entrada.tipo,
    // `occurred_at` no mesmo dia: a poda filtra por `occurred_on`, mas o índice
    // BRIN é sobre o timestamp e um par incoerente esconderia erro de coluna.
    occurredAt: new Date(`${entrada.dia}T12:00:00Z`),
    occurredOn: entrada.dia,
    visitorHash: entrada.visitante,
    ...(entrada.referrer ? { referrer: entrada.referrer } : {}),
    ...(entrada.utmSource ? { utmSource: entrada.utmSource } : {}),
  })
}

async function rollup(dia: string): Promise<number> {
  const resultado = await db.execute<{ rollup_job_stats: number }>(
    sql`select public.rollup_job_stats(${dia}::date)`,
  )
  return Number(
    (resultado as unknown as { rollup_job_stats: number }[])[0]?.rollup_job_stats,
  )
}

async function statsDoDia(dia: string) {
  const [linha] = await db
    .select()
    .from(jobStatsDaily)
    .where(and(eq(jobStatsDaily.jobId, jobId), eq(jobStatsDaily.day, dia)))
    .limit(1)

  return linha
}

beforeAll(async () => {
  const [vaga] = await db.query.jobs.findMany({ limit: 1 })
  expect(vaga, 'o seed precisa ter ao menos uma vaga').toBeDefined()

  jobId = vaga!.id
  contadoresOriginais = { views: vaga!.viewsCount, clicks: vaga!.clicksCount }
})

afterAll(async () => {
  await db
    .delete(jobEvents)
    .where(
      inArray(jobEvents.visitorHash, [VISITANTE, `${VISITANTE}-2`, `${VISITANTE}-3`]),
    )
  await db
    .delete(jobStatsDaily)
    .where(
      and(
        eq(jobStatsDaily.jobId, jobId),
        inArray(jobStatsDaily.day, [DIA, DIA_ANTERIOR, DIA_ANTIGO]),
      ),
    )

  // Os contadores denormalizados são da vaga do seed: devolvê-los evita que
  // esta suíte apareça como "views" em qualquer painel depois.
  await db
    .update(jobs)
    .set({
      viewsCount: contadoresOriginais.views,
      clicksCount: contadoresOriginais.clicks,
    })
    .where(eq(jobs.id, jobId))
})

describe('rollup_job_stats', () => {
  it('agrega o dia por tipo de evento', async () => {
    await plantarEvento({ dia: DIA, tipo: 'view', visitante: VISITANTE })
    await plantarEvento({ dia: DIA, tipo: 'view', visitante: `${VISITANTE}-2` })
    await plantarEvento({ dia: DIA, tipo: 'click_apply', visitante: VISITANTE })
    await plantarEvento({ dia: DIA, tipo: 'share', visitante: VISITANTE })
    // Dia vizinho: se o filtro estivesse errado, entraria na conta do DIA.
    await plantarEvento({ dia: DIA_ANTERIOR, tipo: 'view', visitante: VISITANTE })

    await rollup(DIA)

    expect(await statsDoDia(DIA)).toMatchObject({ views: 2, clicks: 1, shares: 1 })
    expect(await statsDoDia(DIA_ANTERIOR)).toBeUndefined()
  })

  it('reprocessar o mesmo dia recalcula em vez de somar', async () => {
    await rollup(DIA)
    await rollup(DIA)

    // Idempotência é o que permite reprocessar um dia sem medo depois de uma
    // falha do cron (doc 12). Somar seria pior que não rodar.
    expect(await statsDoDia(DIA)).toMatchObject({ views: 2, clicks: 1, shares: 1 })
  })

  it('um evento novo no mesmo dia aparece no reprocessamento', async () => {
    await plantarEvento({ dia: DIA, tipo: 'view', visitante: `${VISITANTE}-3` })

    await rollup(DIA)

    expect(await statsDoDia(DIA)).toMatchObject({ views: 3, clicks: 1, shares: 1 })
  })

  it('atualiza os contadores denormalizados da vaga', async () => {
    await rollup(DIA)

    const [vaga] = await db
      .select({ views: jobs.viewsCount, clicks: jobs.clicksCount })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    // A soma é de todos os dias da vaga, não só do que acabou de rodar: é o
    // número que o card mostra.
    const [soma] = await db
      .select({
        views: sql<number>`coalesce(sum(${jobStatsDaily.views}), 0)::int`,
        clicks: sql<number>`coalesce(sum(${jobStatsDaily.clicks}), 0)::int`,
      })
      .from(jobStatsDaily)
      .where(eq(jobStatsDaily.jobId, jobId))

    expect(vaga?.views).toBe(soma?.views)
    expect(vaga?.clicks).toBe(soma?.clicks)
  })

  it('sem evento no dia não cria linha nem apaga a que existe', async () => {
    const antes = await statsDoDia(DIA)

    await rollup('2019-06-01')

    expect(await statsDoDia(DIA)).toMatchObject({ views: antes!.views })
  })
})

describe('prune_job_events', () => {
  it('apaga o que já foi agregado e passou da retenção', async () => {
    await plantarEvento({ dia: DIA_ANTIGO, tipo: 'view', visitante: VISITANTE })
    await rollup(DIA_ANTIGO)

    const removidos = await db.execute<{ prune_job_events: number }>(
      sql`select public.prune_job_events(90)`,
    )

    expect(
      Number(
        (removidos as unknown as { prune_job_events: number }[])[0]?.prune_job_events,
      ),
    ).toBeGreaterThanOrEqual(1)

    const sobrou = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(jobEvents)
      .where(and(eq(jobEvents.jobId, jobId), eq(jobEvents.occurredOn, DIA_ANTIGO)))

    expect(sobrou[0]?.total).toBe(0)

    // O agregado é eterno (doc 09): a poda leva o evento cru, não o número.
    expect(await statsDoDia(DIA_ANTIGO)).toMatchObject({ views: 1 })
  })

  it('preserva o dia antigo que o rollup ainda não processou', async () => {
    const dia = '2020-02-20'
    await plantarEvento({ dia, tipo: 'view', visitante: VISITANTE })

    await db.execute(sql`select public.prune_job_events(90)`)

    const sobrou = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(jobEvents)
      .where(and(eq(jobEvents.jobId, jobId), eq(jobEvents.occurredOn, dia)))

    // Sem linha em `job_stats_daily`, apagar o evento perderia o número em vez
    // de economizar espaço — é o que acontece se o cron do rollup cair.
    expect(sobrou[0]?.total).toBe(1)

    await db
      .delete(jobEvents)
      .where(and(eq(jobEvents.jobId, jobId), eq(jobEvents.occurredOn, dia)))
  })
})
