import 'server-only'

import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm'

import { db } from '@/db/client'
import {
  auditLogs,
  companies,
  contractTypes,
  dashboardSummary,
  jobs,
  jobStatus,
  jobTags,
  jobTechnologies,
  profiles,
  roleCategories,
  seniorityLevels,
  tags,
  technologies,
  workModes,
} from '@/db/schema'
import type { UserRole } from '@/lib/roles'

/**
 * Leituras do admin (docs 06 e 08). Separadas de `queries/jobs.ts` porque o
 * público lê só o que está publicado, e aqui se vê tudo — rascunho, rejeitada,
 * quem criou.
 *
 * Estas funções rodam com a conexão do app, sem `set local role`: a
 * autorização do admin é de aplicação (doc 04), feita antes de chegar aqui.
 *
 * Paginação por página, não por cursor: o cursor do doc 06 existe para a API
 * pública, que precisa escalar em listas infinitas; a tabela do admin precisa
 * de "página 3 de 12" e opera sobre volume conhecido.
 */

export const ITENS_POR_PAGINA = 20

export type JobStatus = (typeof jobStatus.enumValues)[number]

export const STATUS_DE_VAGA = jobStatus.enumValues

export type AdminJobRow = {
  id: string
  slug: string
  title: string
  status: JobStatus
  companyName: string
  publishedAt: Date | null
  expiresAt: Date | null
  updatedAt: Date
  viewsCount: number
  clicksCount: number
}

export type AdminJobList = {
  linhas: AdminJobRow[]
  total: number
  pagina: number
  totalDePaginas: number
}

export type AdminJobFilters = {
  q?: string
  status?: JobStatus | 'all'
  pagina?: number
}

function paginaValida(pagina: number | undefined): number {
  return Number.isInteger(pagina) && (pagina ?? 0) > 0 ? (pagina as number) : 1
}

export async function listAdminJobs(
  filtros: AdminJobFilters = {},
): Promise<AdminJobList> {
  const pagina = paginaValida(filtros.pagina)
  const termo = filtros.q?.trim()

  const condicoes = [
    filtros.status && filtros.status !== 'all'
      ? eq(jobs.status, filtros.status)
      : undefined,
    termo
      ? or(ilike(jobs.title, `%${termo}%`), ilike(companies.name, `%${termo}%`))
      : undefined,
  ].filter((condicao) => condicao !== undefined)

  const where = condicoes.length > 0 ? and(...condicoes) : undefined

  const [linhas, [totalizador]] = await Promise.all([
    db
      .select({
        id: jobs.id,
        slug: jobs.slug,
        title: jobs.title,
        status: jobs.status,
        companyName: companies.name,
        publishedAt: jobs.publishedAt,
        expiresAt: jobs.expiresAt,
        updatedAt: jobs.updatedAt,
        viewsCount: jobs.viewsCount,
        clicksCount: jobs.clicksCount,
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(where)
      .orderBy(desc(jobs.updatedAt))
      .limit(ITENS_POR_PAGINA)
      .offset((pagina - 1) * ITENS_POR_PAGINA),
    db
      .select({ total: count() })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(where),
  ])

  const total = totalizador?.total ?? 0

  return {
    linhas,
    total,
    pagina,
    totalDePaginas: Math.max(1, Math.ceil(total / ITENS_POR_PAGINA)),
  }
}

export type AdminJobDetail = {
  id: string
  slug: string
  title: string
  companyId: string
  descriptionMd: string
  summary: string | null
  roleCategoryId: string | null
  seniorityId: string | null
  workModeId: string | null
  contractTypeId: string | null
  locationCity: string | null
  locationState: string | null
  locationCountry: string | null
  salaryMin: string | null
  salaryMax: string | null
  salaryCurrency: string | null
  salaryPeriod: string
  benefits: string[]
  keywords: string[]
  language: string
  sourceUrl: string
  applyUrl: string
  status: JobStatus
  publishedAt: Date | null
  expiresAt: Date | null
  technologyIds: string[]
  tagIds: string[]
}

export async function getAdminJob(id: string): Promise<AdminJobDetail | null> {
  const [vaga] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1)
  if (!vaga) return null

  const [tecnologias, etiquetas] = await Promise.all([
    db
      .select({ id: jobTechnologies.technologyId })
      .from(jobTechnologies)
      .where(eq(jobTechnologies.jobId, id)),
    db.select({ id: jobTags.tagId }).from(jobTags).where(eq(jobTags.jobId, id)),
  ])

  return {
    ...vaga,
    technologyIds: tecnologias.map((linha) => linha.id),
    tagIds: etiquetas.map((linha) => linha.id),
  }
}

// ---------------------------------------------------------------------------
// Taxonomias e empresas
// ---------------------------------------------------------------------------

export const TIPOS_DE_TAXONOMIA = [
  'technology',
  'role',
  'seniority',
  'work_mode',
  'contract_type',
  'tag',
] as const

export type TaxonomyKind = (typeof TIPOS_DE_TAXONOMIA)[number]

export const ROTULO_DA_TAXONOMIA: Record<TaxonomyKind, string> = {
  technology: 'Tecnologias',
  role: 'Cargos',
  seniority: 'Senioridades',
  work_mode: 'Modalidades',
  contract_type: 'Contratações',
  tag: 'Tags',
}

/** Cada tipo aponta para a sua tabela e para a coluna de vaga que a referencia. */
const TABELA_DA_TAXONOMIA = {
  technology: technologies,
  role: roleCategories,
  seniority: seniorityLevels,
  work_mode: workModes,
  contract_type: contractTypes,
  tag: tags,
} as const

export function tabelaDaTaxonomia(kind: TaxonomyKind) {
  return TABELA_DA_TAXONOMIA[kind]
}

export type TaxonomyRow = {
  id: string
  slug: string
  label: string
  aliases: string[]
  isActive: boolean
  usos: number
}

/**
 * Contagem de uso por taxonomia: é o que impede desativar algo que sustenta
 * vaga publicada sem saber (doc 06).
 *
 * Por join e não por subconsulta correlacionada: dentro de um `sql` de campo,
 * o Drizzle escreve a coluna sem qualificar a tabela, e `where "tag_id" = "id"`
 * dentro de um `from "jobs"` resolve `"id"` para a tabela de dentro — a conta
 * dá zero em silêncio.
 */
export async function listTaxonomy(kind: TaxonomyKind): Promise<TaxonomyRow[]> {
  const tabela = TABELA_DA_TAXONOMIA[kind]

  const colunas = {
    id: tabela.id,
    slug: tabela.slug,
    label: tabela.label,
    aliases: tabela.aliases,
    isActive: tabela.isActive,
  }

  const ordem = [asc(tabela.sortOrder), asc(tabela.label)] as const

  if (kind === 'technology') {
    return db
      .select({ ...colunas, usos: count(jobTechnologies.jobId) })
      .from(tabela)
      .leftJoin(jobTechnologies, eq(jobTechnologies.technologyId, tabela.id))
      .groupBy(tabela.id)
      .orderBy(...ordem)
  }

  if (kind === 'tag') {
    return db
      .select({ ...colunas, usos: count(jobTags.jobId) })
      .from(tabela)
      .leftJoin(jobTags, eq(jobTags.tagId, tabela.id))
      .groupBy(tabela.id)
      .orderBy(...ordem)
  }

  return db
    .select({ ...colunas, usos: count(jobs.id) })
    .from(tabela)
    .leftJoin(jobs, eq(colunaDaVaga(kind), tabela.id))
    .groupBy(tabela.id)
    .orderBy(...ordem)
}

/** Coluna de `jobs` que referencia a taxonomia — só para os tipos 1:N. */
function colunaDaVaga(kind: Exclude<TaxonomyKind, 'technology' | 'tag'>) {
  const colunas = {
    role: jobs.roleCategoryId,
    seniority: jobs.seniorityId,
    work_mode: jobs.workModeId,
    contract_type: jobs.contractTypeId,
  } as const

  return colunas[kind]
}

export type OpcaoDeTaxonomia = { id: string; slug: string; label: string }

export type OpcoesDoFormulario = {
  empresas: OpcaoDeTaxonomia[]
  cargos: OpcaoDeTaxonomia[]
  senioridades: OpcaoDeTaxonomia[]
  modalidades: OpcaoDeTaxonomia[]
  contratacoes: OpcaoDeTaxonomia[]
  tecnologias: OpcaoDeTaxonomia[]
  etiquetas: OpcaoDeTaxonomia[]
}

type TabelaDeLookup = (typeof TABELA_DA_TAXONOMIA)[TaxonomyKind]

const ativas = (tabela: TabelaDeLookup) =>
  db
    .select({ id: tabela.id, slug: tabela.slug, label: tabela.label })
    .from(tabela)
    .where(eq(tabela.isActive, true))
    .orderBy(asc(tabela.sortOrder), asc(tabela.label))

/** Tudo que o formulário de vaga precisa oferecer, em uma ida ao banco. */
export async function getOpcoesDoFormulario(): Promise<OpcoesDoFormulario> {
  const [
    empresas,
    cargos,
    senioridades,
    modalidades,
    contratacoes,
    tecnologias,
    etiquetas,
  ] = await Promise.all([
    db
      .select({ id: companies.id, slug: companies.slug, label: companies.name })
      .from(companies)
      .orderBy(asc(companies.name)),
    ativas(roleCategories),
    ativas(seniorityLevels),
    ativas(workModes),
    ativas(contractTypes),
    ativas(technologies),
    ativas(tags),
  ])

  return {
    empresas,
    cargos,
    senioridades,
    modalidades,
    contratacoes,
    tecnologias,
    etiquetas,
  }
}

export type CompanyRow = {
  id: string
  name: string
  slug: string
  website: string | null
  logoUrl: string | null
  vagas: number
}

export async function listCompanies(): Promise<CompanyRow[]> {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      website: companies.website,
      logoUrl: companies.logoUrl,
      // `count(jobs.id)` e não `count(*)`: com o left join, empresa sem vaga
      // tem uma linha de nulos e precisa contar zero.
      vagas: count(jobs.id),
    })
    .from(companies)
    .leftJoin(jobs, eq(jobs.companyId, companies.id))
    .groupBy(companies.id)
    .orderBy(asc(companies.name))
}

// ---------------------------------------------------------------------------
// Usuários, painel e auditoria
// ---------------------------------------------------------------------------

export type UserRow = {
  id: string
  displayName: string
  role: UserRole
  createdAt: Date
}

export async function listUsers(): Promise<UserRow[]> {
  return db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      role: profiles.role,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .orderBy(asc(profiles.displayName))
}

export type DashboardSummary = {
  jobsPublished: number
  jobsPendingReview: number
  jobsDraft: number
  jobsArchived: number
  jobsRejected: number
  importsFailed: number
  importsInReview: number
  suggestionsPending: number
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [linha] = await db.select().from(dashboardSummary).limit(1)

  return {
    jobsPublished: linha?.jobsPublished ?? 0,
    jobsPendingReview: linha?.jobsPendingReview ?? 0,
    jobsDraft: linha?.jobsDraft ?? 0,
    jobsArchived: linha?.jobsArchived ?? 0,
    jobsRejected: linha?.jobsRejected ?? 0,
    importsFailed: linha?.importsFailed ?? 0,
    importsInReview: linha?.importsInReview ?? 0,
    suggestionsPending: linha?.suggestionsPending ?? 0,
  }
}

export type AuditRow = {
  id: number
  action: string
  entity: string
  entityId: string | null
  createdAt: Date
  actorName: string | null
}

export async function listRecentAudit(limite = 10): Promise<AuditRow[]> {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
      actorName: profiles.displayName,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(profiles.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.id))
    .limit(limite)
}

/** Rótulos das taxonomias escolhidas, para o audit_logs guardar nome e não UUID. */
export async function rotulosDeTecnologias(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []

  const linhas = await db
    .select({ label: technologies.label })
    .from(technologies)
    .where(inArray(technologies.id, ids))

  return linhas.map((linha) => linha.label)
}
