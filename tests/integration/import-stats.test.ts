import { randomUUID } from 'node:crypto'

import { inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/db/client'
import { estatisticasDeImportacao, tokensDoMes } from '@/db/queries/import-stats'
import { jobImports } from '@/db/schema'
import { hashDaUrl } from '@/lib/source-url'

/**
 * As contagens do painel do doc 09 contra o banco. São cinco consultas com
 * `filter (where ...)` e agrupamento: exatamente o tipo de SQL que passa a
 * mentir em silêncio quando um estado novo aparece.
 */

const criados: string[] = []

afterAll(async () => {
  if (criados.length > 0) {
    await db.delete(jobImports).where(inArray(jobImports.id, criados))
  }
})

async function gravar(linha: Partial<typeof jobImports.$inferInsert>) {
  const url = `https://stats.test/${randomUUID()}`
  const [criada] = await db
    .insert(jobImports)
    .values({ url, urlHash: hashDaUrl(url), status: 'queued', ...linha })
    .returning({ id: jobImports.id })

  criados.push(criada!.id)
  return criada!.id
}

describe('estatisticasDeImportacao', () => {
  it('conta sucesso, falha, etapa, adapter, modelo e latência', async () => {
    const antes = await estatisticasDeImportacao()

    await gravar({
      status: 'review',
      sourceSite: 'greenhouse',
      model: 'modelo-de-teste',
      latencyMs: 4_000,
      tokensIn: 1_000,
      tokensOut: 200,
      aiResponse: { confidence: 0.9 },
    })
    await gravar({
      status: 'review',
      sourceSite: 'greenhouse',
      model: 'modelo-de-teste',
      latencyMs: 12_000,
      tokensIn: 2_000,
      tokensOut: 400,
      aiResponse: { confidence: 0.3 },
    })
    await gravar({
      status: 'failed',
      sourceSite: 'gupy',
      errorStep: 'classifying',
      latencyMs: 50_000,
    })

    const depois = await estatisticasDeImportacao()

    expect(depois.total).toBe(antes.total + 3)
    expect(depois.falhas).toBe(antes.falhas + 1)
    expect(depois.emRevisao).toBe(antes.emRevisao + 2)

    const porEtapa = depois.falhasPorEtapa.find((item) => item.chave === 'classifying')
    expect(porEtapa?.total).toBeGreaterThanOrEqual(1)

    const greenhouse = depois.porAdapter.find((item) => item.chave === 'greenhouse')
    expect(greenhouse?.total).toBeGreaterThanOrEqual(2)

    const modelo = depois.porModelo.find((item) => item.chave === 'modelo-de-teste')
    expect(modelo?.total).toBe(2)

    // Três latências novas, uma delas bem acima: o P95 não pode cair. Afirmar
    // um valor exato dependeria do que outras suítes deixaram na janela.
    expect(depois.latenciaP95Ms).not.toBeNull()
    expect(depois.latenciaP95Ms!).toBeGreaterThanOrEqual(antes.latenciaP95Ms ?? 0)
    expect(depois.latenciaMediaMs).not.toBeNull()

    // Baixa confiança sai do `ai_response`, não de uma coluna: a de 0,3 conta.
    expect(depois.baixaConfianca).toBe(antes.baixaConfianca + 1)
    expect(depois.comResposta).toBe(antes.comResposta + 2)
  })

  it('a taxa de sucesso é a fração que não falhou', async () => {
    const estatisticas = await estatisticasDeImportacao()

    if (estatisticas.total === 0) {
      expect(estatisticas.taxaDeSucesso).toBeNull()
      return
    }

    expect(estatisticas.taxaDeSucesso).toBeCloseTo(
      (estatisticas.total - estatisticas.falhas) / estatisticas.total,
      6,
    )
  })

  it('não conta o que está fora da janela', async () => {
    const dentro = await estatisticasDeImportacao(30)

    await gravar({
      status: 'failed',
      errorStep: 'fetching',
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    })

    expect((await estatisticasDeImportacao(30)).total).toBe(dentro.total)
  })
})

describe('tokensDoMes', () => {
  it('soma só o mês corrente', async () => {
    const antes = await tokensDoMes()

    await gravar({ status: 'review', tokensIn: 500, tokensOut: 100 })
    // Mês passado: fora da conta do teto (doc 05).
    await gravar({
      status: 'review',
      tokensIn: 9_000_000,
      tokensOut: 9_000_000,
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    })

    const depois = await tokensDoMes()

    expect(depois.entrada).toBe(antes.entrada + 500)
    expect(depois.saida).toBe(antes.saida + 100)
  })
})
