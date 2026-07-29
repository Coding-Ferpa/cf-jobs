'use server'

import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { defineAction, FalhaDaAction } from '@/actions/define-action'
import { tabelaDaTaxonomia } from '@/db/queries/admin'
import { kindNoAdmin } from '@/lib/taxonomy-kinds'
import {
  jobImports,
  jobs,
  jobTags,
  jobTechnologies,
  taxonomySuggestions,
} from '@/db/schema'
import {
  aprovarSugestaoSchema,
  mesclarSugestaoSchema,
  rejeitarSugestaoSchema,
} from '@/lib/schemas/suggestion'
import { kebab } from '@/lib/slug'

import type { Transaction } from '@/db/client'

/**
 * Revisão humana das sugestões (doc 05, "fluxo de revisão humana").
 *
 * Três saídas, e a diferença entre elas é o que o sistema aprende:
 *
 * - **Aprovar** cria a taxonomia e vincula à vaga de origem.
 * - **Mesclar** aponta para uma taxonomia existente e guarda o termo nos
 *   `aliases` dela — na próxima vaga, o mapeamento resolve sozinho. É por isso
 *   que mesclar vale mais que rejeitar quando o termo é um sinônimo.
 * - **Rejeitar** encerra sem aprender nada.
 *
 * O papel mínimo é moderador, como na matriz do doc 04.
 */

const TAGS_DE_CACHE = ['jobs']

type Sugestao = typeof taxonomySuggestions.$inferSelect

async function sugestaoPendente(tx: Transaction, id: string): Promise<Sugestao> {
  const [sugestao] = await tx
    .select()
    .from(taxonomySuggestions)
    .where(eq(taxonomySuggestions.id, id))
    .limit(1)

  if (!sugestao) throw new FalhaDaAction('not_found', 'Sugestão não encontrada.')
  if (sugestao.status !== 'pending') {
    throw new FalhaDaAction('validation_error', 'Esta sugestão já foi revisada.')
  }

  return sugestao
}

/** A vaga que originou a sugestão, quando o import ainda aponta para uma. */
async function vagaDeOrigem(tx: Transaction, importId: string | null) {
  if (!importId) return null

  const [linha] = await tx
    .select({ jobId: jobImports.jobId })
    .from(jobImports)
    .where(eq(jobImports.id, importId))
    .limit(1)

  return linha?.jobId ?? null
}

/** O `kind` da sugestão diz qual coluna de `jobs` recebe o vínculo. */
const CAMPO_DA_VAGA: Record<
  string,
  'roleCategoryId' | 'seniorityId' | 'workModeId' | 'contractTypeId'
> = {
  role_category: 'roleCategoryId',
  seniority_level: 'seniorityId',
  work_mode: 'workModeId',
  contract_type: 'contractTypeId',
}

/**
 * Liga a taxonomia recém-decidida à vaga que a originou. Sem isso, aprovar
 * criaria o cadastro e deixaria a vaga sem o vínculo — que é justamente o que
 * quem revisou quis dizer.
 */
async function vincular(
  tx: Transaction,
  entrada: { jobId: string | null; kind: string; taxonomyId: string },
) {
  if (!entrada.jobId) return

  if (entrada.kind === 'technology') {
    await tx
      .insert(jobTechnologies)
      .values({ jobId: entrada.jobId, technologyId: entrada.taxonomyId })
      .onConflictDoNothing()
    return
  }

  if (entrada.kind === 'tag') {
    await tx
      .insert(jobTags)
      .values({ jobId: entrada.jobId, tagId: entrada.taxonomyId })
      .onConflictDoNothing()
    return
  }

  const campo = CAMPO_DA_VAGA[entrada.kind]
  if (!campo) return

  await tx
    .update(jobs)
    .set({ [campo]: entrada.taxonomyId })
    .where(eq(jobs.id, entrada.jobId))
}

async function encerrar(
  tx: Transaction,
  entrada: {
    id: string
    status: 'approved' | 'merged' | 'rejected'
    resolvedTaxonomyId?: string | null
    reviewedBy: string
  },
) {
  await tx
    .update(taxonomySuggestions)
    .set({
      status: entrada.status,
      resolvedTaxonomyId: entrada.resolvedTaxonomyId ?? null,
      reviewedBy: entrada.reviewedBy,
      reviewedAt: new Date(),
    })
    .where(eq(taxonomySuggestions.id, entrada.id))
}

export const aprovarSugestao = defineAction({
  nome: 'taxonomy.approve',
  entidade: 'taxonomy_suggestion',
  papelMinimo: 'moderator',
  schema: aprovarSugestaoSchema,
  revalidar: TAGS_DE_CACHE,
  async executar({ entrada, usuario, tx }) {
    const sugestao = await sugestaoPendente(tx, entrada.id)

    const kindDoAdmin = kindNoAdmin(sugestao.kind)
    if (!kindDoAdmin) {
      throw new FalhaDaAction('validation_error', 'Tipo de taxonomia desconhecido.')
    }

    const tabela = tabelaDaTaxonomia(kindDoAdmin)
    const label = entrada.label ?? sugestao.suggestedLabel
    const slug = kebab(label) || sugestao.normalizedSlug

    const [colisao] = await tx
      .select({ id: tabela.id })
      .from(tabela)
      .where(eq(tabela.slug, slug))
      .limit(1)

    if (colisao) {
      throw new FalhaDaAction(
        'validation_error',
        `Já existe uma taxonomia com o slug "${slug}". Use Mesclar em vez de Aprovar.`,
      )
    }

    const id = randomUUID()
    await tx.insert(tabela).values({
      id,
      slug,
      label,
      // O termo como a IA o escreveu vira alias: na próxima vaga ele resolve
      // por alias, sem passar por aqui de novo.
      aliases: [
        ...new Set([sugestao.normalizedSlug, sugestao.suggestedLabel.toLowerCase()]),
      ],
      ...(kindDoAdmin === 'technology' ? { kind: entrada.technologyKind ?? 'tool' } : {}),
      ...(kindDoAdmin === 'seniority' ? { rank: entrada.rank ?? 50 } : {}),
    } as typeof tabela.$inferInsert)

    const jobId = await vagaDeOrigem(tx, sugestao.importId)
    await vincular(tx, { jobId, kind: sugestao.kind, taxonomyId: id })
    await encerrar(tx, {
      id: sugestao.id,
      status: 'approved',
      resolvedTaxonomyId: id,
      reviewedBy: usuario.id,
    })

    return {
      data: { id, slug, label },
      entityId: sugestao.id,
      diff: { aprovada: { kind: sugestao.kind, slug, label } },
    }
  },
})

export const mesclarSugestao = defineAction({
  nome: 'taxonomy.merge',
  entidade: 'taxonomy_suggestion',
  papelMinimo: 'moderator',
  schema: mesclarSugestaoSchema,
  revalidar: TAGS_DE_CACHE,
  async executar({ entrada, usuario, tx }) {
    const sugestao = await sugestaoPendente(tx, entrada.id)

    const kindDoAdmin = kindNoAdmin(sugestao.kind)
    if (!kindDoAdmin) {
      throw new FalhaDaAction('validation_error', 'Tipo de taxonomia desconhecido.')
    }

    const tabela = tabelaDaTaxonomia(kindDoAdmin)

    const [alvo] = await tx
      .select({ id: tabela.id, slug: tabela.slug, aliases: tabela.aliases })
      .from(tabela)
      .where(eq(tabela.id, entrada.taxonomyId))
      .limit(1)

    if (!alvo) throw new FalhaDaAction('not_found', 'Taxonomia de destino não existe.')

    // É aqui que o sistema aprende: o termo entra nos aliases e o mapeamento
    // da próxima importação resolve sozinho (doc 05).
    const novos = [
      ...new Set([
        ...alvo.aliases,
        sugestao.normalizedSlug,
        sugestao.suggestedLabel.toLowerCase(),
      ]),
    ]

    await tx.update(tabela).set({ aliases: novos }).where(eq(tabela.id, alvo.id))

    const jobId = await vagaDeOrigem(tx, sugestao.importId)
    await vincular(tx, { jobId, kind: sugestao.kind, taxonomyId: alvo.id })
    await encerrar(tx, {
      id: sugestao.id,
      status: 'merged',
      resolvedTaxonomyId: alvo.id,
      reviewedBy: usuario.id,
    })

    return {
      data: { slug: alvo.slug, aliases: novos },
      entityId: sugestao.id,
      diff: {
        mesclada: { em: alvo.slug, alias: sugestao.normalizedSlug },
      },
    }
  },
})

export const rejeitarSugestao = defineAction({
  nome: 'taxonomy.reject',
  entidade: 'taxonomy_suggestion',
  papelMinimo: 'moderator',
  schema: rejeitarSugestaoSchema,
  async executar({ entrada, usuario, tx }) {
    const sugestao = await sugestaoPendente(tx, entrada.id)

    await encerrar(tx, {
      id: sugestao.id,
      status: 'rejected',
      reviewedBy: usuario.id,
    })

    return {
      data: { id: sugestao.id },
      entityId: sugestao.id,
      diff: { rejeitada: { kind: sugestao.kind, label: sugestao.suggestedLabel } },
    }
  },
})
