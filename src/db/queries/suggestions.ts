import 'server-only'

import { and, desc, eq, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { companies, jobImports, jobs, profiles, taxonomySuggestions } from '@/db/schema'
import { tabelaDaTaxonomia } from '@/db/queries/admin'
import { kindNoAdmin } from '@/lib/taxonomy-kinds'

/**
 * Fila de sugestões de taxonomia (doc 05, etapa 4).
 *
 * Existe porque a IA **não** cria taxonomia: termo que ela encontrou e o
 * cadastro não conhece para aqui, com o contexto e a vaga de origem, para um
 * moderador aprovar, mesclar ou rejeitar.
 */

export type SugestaoPendente = {
  id: string
  kind: string
  suggestedLabel: string
  normalizedSlug: string
  context: string | null
  status: 'pending' | 'approved' | 'rejected' | 'merged'
  createdAt: Date
  importId: string | null
  /** Vaga que originou — é o contexto que faz a decisão ser possível. */
  jobId: string | null
  jobTitle: string | null
  companyName: string | null
  sourceUrl: string | null
  revisadoPor: string | null
}

const COLUNAS = {
  id: taxonomySuggestions.id,
  kind: taxonomySuggestions.kind,
  suggestedLabel: taxonomySuggestions.suggestedLabel,
  normalizedSlug: taxonomySuggestions.normalizedSlug,
  context: taxonomySuggestions.context,
  status: taxonomySuggestions.status,
  createdAt: taxonomySuggestions.createdAt,
  importId: taxonomySuggestions.importId,
  jobId: jobImports.jobId,
  jobTitle: jobs.title,
  companyName: companies.name,
  sourceUrl: jobs.sourceUrl,
  revisadoPor: profiles.displayName,
}

function consulta() {
  return db
    .select(COLUNAS)
    .from(taxonomySuggestions)
    .leftJoin(jobImports, eq(jobImports.id, taxonomySuggestions.importId))
    .leftJoin(jobs, eq(jobs.id, jobImports.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(profiles, eq(profiles.id, taxonomySuggestions.reviewedBy))
}

export async function listarSugestoes(
  status: 'pending' | 'approved' | 'rejected' | 'merged' = 'pending',
): Promise<SugestaoPendente[]> {
  const linhas = await consulta()
    .where(eq(taxonomySuggestions.status, status))
    .orderBy(desc(taxonomySuggestions.createdAt))
    .limit(200)

  return linhas as SugestaoPendente[]
}

/** As sugestões desta vaga, para o painel lateral da tela de revisão (doc 08). */
export async function sugestoesDaVaga(jobId: string): Promise<SugestaoPendente[]> {
  const linhas = await consulta()
    .where(and(eq(jobImports.jobId, jobId), eq(taxonomySuggestions.status, 'pending')))
    .orderBy(desc(taxonomySuggestions.createdAt))

  return linhas as SugestaoPendente[]
}

/** Destinos possíveis do "Mesclar", do mesmo tipo da sugestão. */
export async function taxonomiasDoTipo(
  kind: string,
): Promise<{ id: string; label: string; slug: string }[]> {
  const kindDoAdmin = kindNoAdmin(kind)
  if (!kindDoAdmin) return []

  const tabela = tabelaDaTaxonomia(kindDoAdmin)

  return db
    .select({ id: tabela.id, label: tabela.label, slug: tabela.slug })
    .from(tabela)
    .where(eq(tabela.isActive, true))
    .orderBy(sql`lower(${tabela.label})`)
}

export async function contarSugestoesPendentes(): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(taxonomySuggestions)
    .where(eq(taxonomySuggestions.status, 'pending'))

  return Number(linha?.total ?? 0)
}
