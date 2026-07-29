import { randomUUID } from 'node:crypto'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/db/client'
import { repositorioDoPipeline } from '@/db/queries/import-pipeline'
import { catalogoDoBanco } from '@/db/queries/taxonomy-catalog'
import {
  companies,
  jobImports,
  jobs,
  jobTags,
  jobTechnologies,
  taxonomySuggestions,
} from '@/db/schema'
import { mapearTaxonomias } from '@/features/import/map-taxonomies'
import type { DadosParaPersistir } from '@/features/import/pipeline'
import type { VagaClassificada } from '@/features/import/schema'
import { hashDaUrl } from '@/lib/source-url'

/**
 * A etapa 5 do doc 05 contra o banco: empresa, vaga, junções, sugestões e o
 * `job_imports` **na mesma transação**. É o teste que garante que não sobra
 * vaga sem tecnologia nem importação marcada como concluída sem vaga.
 */

const repositorio = repositorioDoPipeline()
const catalogo = catalogoDoBanco()

const importsCriados: string[] = []
const vagasCriadas: string[] = []
const empresasCriadas: string[] = []
const sugestoesCriadas: string[] = []

afterAll(async () => {
  if (sugestoesCriadas.length > 0) {
    await db
      .delete(taxonomySuggestions)
      .where(inArray(taxonomySuggestions.id, sugestoesCriadas))
  }
  if (vagasCriadas.length > 0) {
    await db.delete(jobTechnologies).where(inArray(jobTechnologies.jobId, vagasCriadas))
    await db.delete(jobTags).where(inArray(jobTags.jobId, vagasCriadas))
  }
  if (importsCriados.length > 0) {
    await db
      .update(jobImports)
      .set({ jobId: null })
      .where(inArray(jobImports.id, importsCriados))
  }
  if (vagasCriadas.length > 0) {
    await db.delete(jobs).where(inArray(jobs.id, vagasCriadas))
  }
  if (importsCriados.length > 0) {
    await db.delete(jobImports).where(inArray(jobImports.id, importsCriados))
  }
  if (empresasCriadas.length > 0) {
    await db.delete(companies).where(inArray(companies.id, empresasCriadas))
  }
})

async function abrirImportacao(url: string): Promise<string> {
  const [linha] = await db
    .insert(jobImports)
    .values({ url, urlHash: hashDaUrl(url), status: 'queued' })
    .returning({ id: jobImports.id })

  importsCriados.push(linha!.id)
  return linha!.id
}

function vagaDe(campos: Partial<VagaClassificada> = {}): VagaClassificada {
  return {
    title: 'Pessoa Desenvolvedora Backend',
    company_name: `Empresa Teste ${randomUUID().slice(0, 8)}`,
    summary: 'Vaga de backend para a suíte de integração.',
    description_md: `## Sobre\n\n${'Conteúdo suficiente da vaga. '.repeat(10)}`,
    work_mode: 'hybrid',
    contract_type: 'clt',
    seniority: 'senior',
    role_category: 'backend',
    technologies: ['go', 'postgresql'],
    tags: ['fintech'],
    unmatched_terms: [],
    location: { city: 'Recife', state: 'PE', country: 'BR' },
    salary: { min: 12000, max: 18000, currency: 'BRL', period: 'month' },
    benefits: ['Plano de saúde'],
    keywords: ['go'],
    language: 'pt-BR',
    posted_at: null,
    confidence: 0.9,
    ...campos,
  }
}

async function persistir(
  vaga: VagaClassificada,
  url: string,
): Promise<{ jobId: string; slug: string; importId: string }> {
  const importId = await abrirImportacao(url)
  const mapa = await mapearTaxonomias(vaga, catalogo)

  const dados: DadosParaPersistir = {
    importId,
    url,
    urlHash: hashDaUrl(url),
    sourceSite: 'greenhouse',
    criadoPor: null as unknown as string,
    vaga,
    mapa,
    uso: {
      modelo: 'z-ai/glm-5.2',
      tokensIn: 6200,
      tokensOut: 950,
      tentativas: 1,
      guidedJson: true,
      latenciaMs: 8200,
      reparada: false,
    },
    latenciaMs: 11_400,
  }

  const persistida = await repositorio.persistir(dados)
  vagasCriadas.push(persistida.jobId)

  const [empresa] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(sql`lower(${companies.name}) = lower(${vaga.company_name})`)
    .limit(1)
  if (empresa) empresasCriadas.push(empresa.id)

  return { ...persistida, importId }
}

describe('persistência da importação', () => {
  it('cria vaga em revisão com empresa, junções e o import fechado', async () => {
    const vaga = vagaDe()
    const { jobId, slug, importId } = await persistir(
      vaga,
      `https://boards.greenhouse.io/teste/jobs/${randomUUID().slice(0, 8)}`,
    )

    const [criada] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)

    expect(criada).toMatchObject({
      slug,
      title: 'Pessoa Desenvolvedora Backend',
      status: 'pending_review',
      sourceSite: 'greenhouse',
      locationCity: 'Recife',
      locationCountry: 'BR',
      salaryCurrency: 'BRL',
      salaryPeriod: 'month',
    })
    // numeric(12,2) volta como string do driver — o valor é o que importa.
    expect(Number(criada?.salaryMin)).toBe(12000)

    // `hybrid` só resolve pelo alias de `hibrido`: se o mapeamento tivesse
    // descartado antes, esta coluna estaria nula.
    expect(criada?.workModeId).not.toBeNull()
    expect(criada?.seniorityId).not.toBeNull()

    const vinculos = await db
      .select()
      .from(jobTechnologies)
      .where(eq(jobTechnologies.jobId, jobId))
    expect(vinculos).toHaveLength(2)
    expect(vinculos.filter((v) => v.isPrimary)).toHaveLength(1)

    const [importacao] = await db
      .select()
      .from(jobImports)
      .where(eq(jobImports.id, importId))
      .limit(1)

    expect(importacao).toMatchObject({
      status: 'review',
      jobId,
      // Também no import, e não só na vaga: a retomada pelo cache não passa
      // pelo `guardarConteudo`, e o painel por adapter perderia essas linhas.
      sourceSite: 'greenhouse',
      model: 'z-ai/glm-5.2',
      tokensIn: 6200,
      tokensOut: 950,
      latencyMs: 11_400,
      errorStep: null,
    })
    expect(importacao?.finishedAt).not.toBeNull()
  })

  it('reaproveita a empresa existente em vez de duplicar', async () => {
    const nome = `Aurora Repetida ${randomUUID().slice(0, 6)}`

    const primeira = await persistir(
      vagaDe({ company_name: nome }),
      `https://x.test/a/${randomUUID()}`,
    )
    const segunda = await persistir(
      // Caixa diferente: o match do doc 05 é por `lower(name)`.
      vagaDe({ company_name: nome.toUpperCase() }),
      `https://x.test/b/${randomUUID()}`,
    )

    const [a] = await db
      .select({ companyId: jobs.companyId })
      .from(jobs)
      .where(eq(jobs.id, primeira.jobId))
    const [b] = await db
      .select({ companyId: jobs.companyId })
      .from(jobs)
      .where(eq(jobs.id, segunda.jobId))

    expect(a?.companyId).toBe(b?.companyId)
  })

  it('grava sugestão pendente do termo desconhecido', async () => {
    const termo = `Datomic${randomUUID().slice(0, 6)}`
    const { importId } = await persistir(
      vagaDe({
        unmatched_terms: [{ kind: 'technology', label: termo, context: 'usa muito' }],
      }),
      `https://x.test/c/${randomUUID()}`,
    )

    const sugestoes = await db
      .select()
      .from(taxonomySuggestions)
      .where(eq(taxonomySuggestions.importId, importId))

    sugestoes.forEach((s) => sugestoesCriadas.push(s.id))

    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]).toMatchObject({
      kind: 'technology',
      suggestedLabel: termo,
      status: 'pending',
      context: 'usa muito',
    })
  })

  /**
   * O índice único parcial existe para isso: o mesmo termo desconhecido em dez
   * vagas gera uma sugestão, não dez. O conflito é esperado e não pode derrubar
   * a segunda importação.
   */
  it('o mesmo termo em duas vagas não duplica a fila nem falha', async () => {
    const termo = `Termo Repetido ${randomUUID().slice(0, 6)}`
    const naoMapeado = [{ kind: 'technology' as const, label: termo, context: null }]

    await persistir(
      vagaDe({ unmatched_terms: naoMapeado }),
      `https://x.test/d/${randomUUID()}`,
    )
    await persistir(
      vagaDe({ unmatched_terms: naoMapeado }),
      `https://x.test/e/${randomUUID()}`,
    )

    const sugestoes = await db
      .select()
      .from(taxonomySuggestions)
      .where(
        and(
          eq(taxonomySuggestions.kind, 'technology'),
          eq(taxonomySuggestions.suggestedLabel, termo),
        ),
      )

    sugestoes.forEach((s) => sugestoesCriadas.push(s.id))
    expect(sugestoes).toHaveLength(1)
  })

  it('URL repetida esbarra no unique de source_url_hash', async () => {
    const url = `https://x.test/f/${randomUUID()}`
    await persistir(vagaDe(), url)

    await expect(persistir(vagaDe(), url)).rejects.toThrow()
  })
})

describe('marcações de etapa', () => {
  it('grava cada etapa fora de transação, para o polling enxergar', async () => {
    const importId = await abrirImportacao(`https://x.test/g/${randomUUID()}`)

    await repositorio.marcarEtapa(importId, 'fetching')
    const [durante] = await db
      .select({ status: jobImports.status })
      .from(jobImports)
      .where(eq(jobImports.id, importId))

    expect(durante?.status).toBe('fetching')
  })

  it('ignora `persisting`, que não é estado do enum do banco', async () => {
    const importId = await abrirImportacao(`https://x.test/h/${randomUUID()}`)

    await repositorio.marcarEtapa(importId, 'mapping')
    await expect(repositorio.marcarEtapa(importId, 'persisting')).resolves.toBeUndefined()

    const [linha] = await db
      .select({ status: jobImports.status })
      .from(jobImports)
      .where(eq(jobImports.id, importId))

    expect(linha?.status).toBe('mapping')
  })

  it('fecha a tentativa duplicada apontando para a vaga existente', async () => {
    const importId = await abrirImportacao(`https://x.test/dup/${randomUUID()}`)
    const [vaga] = await db.query.jobs.findMany({ limit: 1 })

    await repositorio.marcarDuplicada(importId, {
      id: vaga!.id,
      slug: vaga!.slug,
      title: vaga!.title,
    })

    const [linha] = await db
      .select()
      .from(jobImports)
      .where(eq(jobImports.id, importId))
      .limit(1)

    // `completed`, não `failed`: a tentativa terminou e o log tem para onde
    // mandar quem clicar. Repetir não mudaria nada.
    expect(linha).toMatchObject({ status: 'completed', jobId: vaga!.id })
    expect(linha?.finishedAt).toBeInstanceOf(Date)
  })

  it('registra a falha com etapa e mensagem', async () => {
    const importId = await abrirImportacao(`https://x.test/i/${randomUUID()}`)

    await repositorio.falhar(importId, {
      etapa: 'classifying',
      mensagem: 'Os três modelos falharam.',
      latenciaMs: 47_000,
    })

    const [linha] = await db
      .select()
      .from(jobImports)
      .where(eq(jobImports.id, importId))
      .limit(1)

    expect(linha).toMatchObject({
      status: 'failed',
      errorStep: 'classifying',
      errorMessage: 'Os três modelos falharam.',
      latencyMs: 47_000,
    })
  })
})
