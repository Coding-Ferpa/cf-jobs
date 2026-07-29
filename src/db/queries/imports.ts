import 'server-only'

import { and, count, desc, eq, gt, isNotNull, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { companies, jobImports, jobs, profiles } from '@/db/schema'

/**
 * Consultas de dedup do pipeline de importação (doc 05, etapa 1.4).
 *
 * Rodam pela conexão da aplicação, como o resto do admin: quem autoriza é a
 * Server Action que chamou o pipeline, e a RLS não se aplica a esta conexão
 * (ver o comentário em `defineAction`).
 */

/** Cache de conteúdo tem 24h — depois disso a vaga pode ter mudado. */
export const HORAS_DE_CACHE = 24

export type VagaJaCadastrada = {
  id: string
  slug: string
  title: string
  status: 'draft' | 'pending_review' | 'published' | 'archived' | 'rejected'
}

/**
 * A mesma URL já virou vaga? O hash é o da URL canônica, então dois links que
 * só diferem em UTM caem aqui do mesmo jeito.
 */
export async function buscarVagaPorHash(
  urlHash: string,
): Promise<VagaJaCadastrada | null> {
  const [vaga] = await db
    .select({
      id: jobs.id,
      slug: jobs.slug,
      title: jobs.title,
      status: jobs.status,
    })
    .from(jobs)
    .where(eq(jobs.sourceUrlHash, urlHash))
    .limit(1)

  return vaga ?? null
}

export type ConteudoEmCache = {
  importId: string
  url: string
  sourceSite: string | null
  rawContent: string
}

/**
 * Conteúdo já buscado nas últimas 24h. Serve ao "Tentar novamente" do admin e
 * a quem cola a mesma URL duas vezes: reprocessar a IA sem refazer o fetch é
 * mais rápido e evita bater de novo no board por nada.
 */
export async function buscarConteudoEmCache(
  urlHash: string,
  agora = new Date(),
): Promise<ConteudoEmCache | null> {
  const limite = new Date(agora.getTime() - HORAS_DE_CACHE * 60 * 60 * 1000)

  const [importacao] = await db
    .select({
      importId: jobImports.id,
      url: jobImports.url,
      sourceSite: jobImports.sourceSite,
      rawContent: jobImports.rawContent,
    })
    .from(jobImports)
    .where(
      and(
        eq(jobImports.urlHash, urlHash),
        isNotNull(jobImports.rawContent),
        gt(jobImports.createdAt, limite),
      ),
    )
    .orderBy(desc(jobImports.createdAt))
    .limit(1)

  if (!importacao?.rawContent) return null

  return {
    importId: importacao.importId,
    url: importacao.url,
    sourceSite: importacao.sourceSite,
    rawContent: importacao.rawContent,
  }
}

/** Estados pelos quais o pipeline passa, na ordem do doc 05. */
export const ETAPAS_DA_IMPORTACAO = [
  'queued',
  'fetching',
  'extracting',
  'classifying',
  'mapping',
  'review',
] as const

export type EtapaDaImportacao = (typeof ETAPAS_DA_IMPORTACAO)[number]

export type StatusDaImportacao = {
  id: string
  url: string
  status: EtapaDaImportacao | 'completed' | 'failed'
  sourceSite: string | null
  errorStep: string | null
  errorMessage: string | null
  model: string | null
  tokensIn: number | null
  tokensOut: number | null
  latencyMs: number | null
  attempt: number
  jobId: string | null
  jobSlug: string | null
  createdAt: Date
  finishedAt: Date | null
}

/**
 * O que a barra de progresso lê a cada polling (doc 08). É de propósito uma
 * consulta só e magra: `raw_content` e `ai_response` podem ter dezenas de
 * milhares de caracteres e não têm o que fazer numa resposta que se repete a
 * cada segundo.
 */
export async function buscarImportacao(id: string): Promise<StatusDaImportacao | null> {
  const [linha] = await db
    .select({
      id: jobImports.id,
      url: jobImports.url,
      status: jobImports.status,
      sourceSite: jobImports.sourceSite,
      errorStep: jobImports.errorStep,
      errorMessage: jobImports.errorMessage,
      model: jobImports.model,
      tokensIn: jobImports.tokensIn,
      tokensOut: jobImports.tokensOut,
      latencyMs: jobImports.latencyMs,
      attempt: jobImports.attempt,
      jobId: jobImports.jobId,
      jobSlug: jobs.slug,
      createdAt: jobImports.createdAt,
      finishedAt: jobImports.finishedAt,
    })
    .from(jobImports)
    .leftJoin(jobs, eq(jobs.id, jobImports.jobId))
    .where(eq(jobImports.id, id))
    .limit(1)

  return (linha as StatusDaImportacao | undefined) ?? null
}

export type ImportacaoDaVaga = {
  id: string
  url: string
  sourceSite: string | null
  model: string | null
  tokensIn: number | null
  tokensOut: number | null
  latencyMs: number | null
  attempt: number
  aiResponse: unknown
  createdAt: Date
}

/**
 * A importação que gerou a vaga, para a tela de revisão (doc 08). Aqui o
 * `ai_response` **é** necessário: é com ele que a tela compara o que a IA leu
 * com o que virou vaga.
 */
export async function importacaoDaVaga(jobId: string): Promise<ImportacaoDaVaga | null> {
  const [linha] = await db
    .select({
      id: jobImports.id,
      url: jobImports.url,
      sourceSite: jobImports.sourceSite,
      model: jobImports.model,
      tokensIn: jobImports.tokensIn,
      tokensOut: jobImports.tokensOut,
      latencyMs: jobImports.latencyMs,
      attempt: jobImports.attempt,
      aiResponse: jobImports.aiResponse,
      createdAt: jobImports.createdAt,
    })
    .from(jobImports)
    .where(eq(jobImports.jobId, jobId))
    .orderBy(desc(jobImports.createdAt))
    .limit(1)

  return linha ?? null
}

export type LinhaDeImportacao = StatusDaImportacao & {
  jobTitle: string | null
  companyName: string | null
  solicitadoPor: string | null
}

export type FiltrosDeImportacao = {
  status?: string
  sourceSite?: string
  model?: string
  pagina?: number
  porPagina?: number
}

export type PaginaDeImportacoes = {
  linhas: LinhaDeImportacao[]
  total: number
  sourceSites: string[]
  models: string[]
}

/** Log do `/admin/importacoes` (doc 08): filtro por status, adapter e modelo. */
export async function listarImportacoes(
  filtros: FiltrosDeImportacao = {},
): Promise<PaginaDeImportacoes> {
  const porPagina = Math.min(Math.max(filtros.porPagina ?? 25, 1), 100)
  const pagina = Math.max(filtros.pagina ?? 1, 1)

  const condicoes = [
    filtros.status ? eq(jobImports.status, filtros.status as EtapaDaImportacao) : null,
    filtros.sourceSite ? eq(jobImports.sourceSite, filtros.sourceSite) : null,
    filtros.model ? eq(jobImports.model, filtros.model) : null,
  ].filter((condicao) => condicao !== null)

  const onde = condicoes.length > 0 ? and(...condicoes) : undefined

  const linhas = await db
    .select({
      id: jobImports.id,
      url: jobImports.url,
      status: jobImports.status,
      sourceSite: jobImports.sourceSite,
      errorStep: jobImports.errorStep,
      errorMessage: jobImports.errorMessage,
      model: jobImports.model,
      tokensIn: jobImports.tokensIn,
      tokensOut: jobImports.tokensOut,
      latencyMs: jobImports.latencyMs,
      attempt: jobImports.attempt,
      jobId: jobImports.jobId,
      jobSlug: jobs.slug,
      jobTitle: jobs.title,
      companyName: companies.name,
      solicitadoPor: profiles.displayName,
      createdAt: jobImports.createdAt,
      finishedAt: jobImports.finishedAt,
    })
    .from(jobImports)
    .leftJoin(jobs, eq(jobs.id, jobImports.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(profiles, eq(profiles.id, jobImports.requestedBy))
    .where(onde)
    .orderBy(desc(jobImports.createdAt))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina)

  const [totais] = await db.select({ total: count() }).from(jobImports).where(onde)

  // As opções dos filtros saem do que existe: adapter e modelo mudam com o
  // tempo, e uma lista fixa envelheceria em silêncio.
  const distintos = await db.execute<{
    source_site: string | null
    model: string | null
  }>(
    sql`
      select distinct source_site, model from public.job_imports
    `,
  )
  const opcoes = distintos as unknown as {
    source_site: string | null
    model: string | null
  }[]

  return {
    linhas: linhas as LinhaDeImportacao[],
    total: Number(totais?.total ?? 0),
    sourceSites: [
      ...new Set(opcoes.map((o) => o.source_site).filter((v) => v !== null)),
    ].sort(),
    models: [...new Set(opcoes.map((o) => o.model).filter((v) => v !== null))].sort(),
  }
}
