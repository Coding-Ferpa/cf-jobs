import 'server-only'

import { and, desc, eq, gt, isNotNull } from 'drizzle-orm'

import { db } from '@/db/client'
import { jobImports, jobs } from '@/db/schema'

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
