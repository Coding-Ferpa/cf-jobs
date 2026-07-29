import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/db/client'
import {
  buscarConteudoEmCache,
  buscarVagaPorHash,
  HORAS_DE_CACHE,
} from '@/db/queries/imports'
import { jobImports } from '@/db/schema'
import { hashDaUrl } from '@/lib/source-url'

/**
 * Dedup do pipeline (doc 05, etapa 1.4) contra o banco de verdade.
 */

const criados: string[] = []

async function gravarImport(entrada: {
  url: string
  rawContent: string | null
  createdAt?: Date
}) {
  const [linha] = await db
    .insert(jobImports)
    .values({
      url: entrada.url,
      urlHash: hashDaUrl(entrada.url),
      rawContent: entrada.rawContent,
      sourceSite: 'greenhouse',
      status: 'review',
      ...(entrada.createdAt ? { createdAt: entrada.createdAt } : {}),
    })
    .returning({ id: jobImports.id })

  if (linha) criados.push(linha.id)
  return linha!.id
}

afterAll(async () => {
  for (const id of criados) {
    await db.delete(jobImports).where(eq(jobImports.id, id))
  }
})

describe('buscarVagaPorHash', () => {
  it('encontra a vaga do seed pela URL de origem', async () => {
    const [vaga] = await db.query.jobs.findMany({ limit: 1 })
    expect(vaga).toBeDefined()

    const achada = await buscarVagaPorHash(vaga!.sourceUrlHash)

    expect(achada?.slug).toBe(vaga!.slug)
  })

  it('devolve null para URL nunca importada', async () => {
    expect(await buscarVagaPorHash(hashDaUrl('https://novo.test/vaga'))).toBeNull()
  })

  it('reconhece a mesma vaga por link com UTM diferente', async () => {
    const [vaga] = await db.query.jobs.findMany({ limit: 1 })
    const comCampanha = `${vaga!.sourceUrl}?utm_source=linkedin&utm_campaign=abril`

    expect((await buscarVagaPorHash(hashDaUrl(comCampanha)))?.slug).toBe(vaga!.slug)
  })
})

describe('buscarConteudoEmCache', () => {
  it('reaproveita conteúdo buscado agora', async () => {
    const url = `https://boards.greenhouse.io/org/jobs/${randomUUID().slice(0, 8)}`
    await gravarImport({ url, rawContent: '# Vaga em cache' })

    const cache = await buscarConteudoEmCache(hashDaUrl(url))

    expect(cache?.rawContent).toBe('# Vaga em cache')
    expect(cache?.sourceSite).toBe('greenhouse')
  })

  it('ignora conteúdo mais velho que a janela de cache', async () => {
    const url = `https://boards.greenhouse.io/org/jobs/${randomUUID().slice(0, 8)}`
    const ontem = new Date(Date.now() - (HORAS_DE_CACHE + 1) * 60 * 60 * 1000)
    await gravarImport({ url, rawContent: '# Velho demais', createdAt: ontem })

    expect(await buscarConteudoEmCache(hashDaUrl(url))).toBeNull()
  })

  it('ignora importação que falhou antes de extrair conteúdo', async () => {
    const url = `https://boards.greenhouse.io/org/jobs/${randomUUID().slice(0, 8)}`
    await gravarImport({ url, rawContent: null })

    expect(await buscarConteudoEmCache(hashDaUrl(url))).toBeNull()
  })

  it('devolve a tentativa mais recente quando há várias', async () => {
    const url = `https://boards.greenhouse.io/org/jobs/${randomUUID().slice(0, 8)}`
    const antes = new Date(Date.now() - 60 * 60 * 1000)
    await gravarImport({ url, rawContent: '# Primeira', createdAt: antes })
    await gravarImport({ url, rawContent: '# Segunda' })

    expect((await buscarConteudoEmCache(hashDaUrl(url)))?.rawContent).toBe('# Segunda')
  })
})
