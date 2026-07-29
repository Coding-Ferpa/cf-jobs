'use server'

import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { defineAction, FalhaDaAction } from '@/actions/define-action'
import { companies, jobs, jobTags, jobTechnologies } from '@/db/schema'
import {
  atualizarVagaSchema,
  criarVagaSchema,
  excluirVagaSchema,
  transicaoDeVagaSchema,
  type VagaValidada,
} from '@/lib/schemas/job'
import { hashDaUrl } from '@/lib/source-url'
import { jobSlug } from '@/lib/slug'

import type { Transaction } from '@/db/client'

/**
 * CRUD manual de vagas (docs 06 e 14). Toda action passa pelo esqueleto do
 * `defineAction`: sessão → Zod → papel → operação → audit_logs → revalidateTag.
 *
 * O doc 06 lista `updateJob` e as transições; a criação manual vem do escopo
 * do M4 no doc 14 e segue o mesmo contrato.
 */

const TAGS_DE_CACHE = ['jobs']

/** Campos de `jobs` que vêm do formulário — sem status, datas nem contadores. */
function camposDaVaga(entrada: VagaValidada) {
  return {
    title: entrada.title,
    companyId: entrada.companyId,
    descriptionMd: entrada.descriptionMd,
    summary: entrada.summary,
    roleCategoryId: entrada.roleCategoryId,
    seniorityId: entrada.seniorityId,
    workModeId: entrada.workModeId,
    contractTypeId: entrada.contractTypeId,
    locationCity: entrada.locationCity,
    locationState: entrada.locationState,
    locationCountry: entrada.locationCountry,
    salaryMin: entrada.salaryMin,
    salaryMax: entrada.salaryMax,
    salaryCurrency: entrada.salaryCurrency,
    salaryPeriod: entrada.salaryPeriod,
    benefits: entrada.benefits,
    keywords: entrada.keywords,
    language: entrada.language,
    sourceUrl: entrada.sourceUrl,
    sourceUrlHash: hashDaUrl(entrada.sourceUrl),
    applyUrl: entrada.applyUrl,
  }
}

async function nomeDaEmpresa(tx: Transaction, companyId: string): Promise<string> {
  const [empresa] = await tx
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!empresa) throw new FalhaDaAction('not_found', 'Empresa não encontrada.')

  return empresa.name
}

/** Regrava os vínculos por inteiro: é mais simples de acertar que um diff. */
async function gravarVinculos(
  tx: Transaction,
  jobId: string,
  technologyIds: string[],
  tagIds: string[],
) {
  await tx.delete(jobTechnologies).where(eq(jobTechnologies.jobId, jobId))
  await tx.delete(jobTags).where(eq(jobTags.jobId, jobId))

  if (technologyIds.length > 0) {
    await tx.insert(jobTechnologies).values(
      technologyIds.map((technologyId, indice) => ({
        jobId,
        technologyId,
        // A primeira escolhida é a principal (doc 04).
        isPrimary: indice === 0,
      })),
    )
  }

  if (tagIds.length > 0) {
    await tx.insert(jobTags).values(tagIds.map((tagId) => ({ jobId, tagId })))
  }
}

async function vagaExistente(tx: Transaction, id: string) {
  const [vaga] = await tx
    .select({ id: jobs.id, slug: jobs.slug, title: jobs.title, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1)

  if (!vaga) throw new FalhaDaAction('not_found', 'Vaga não encontrada.')

  return vaga
}

export const criarVaga = defineAction({
  nome: 'job.create',
  entidade: 'job',
  papelMinimo: 'editor',
  schema: criarVagaSchema,
  revalidar: TAGS_DE_CACHE,
  async executar({ entrada, usuario, tx }) {
    const hash = hashDaUrl(entrada.sourceUrl)

    const [duplicada] = await tx
      .select({ slug: jobs.slug })
      .from(jobs)
      .where(eq(jobs.sourceUrlHash, hash))
      .limit(1)

    if (duplicada) {
      throw new FalhaDaAction(
        'duplicate_job',
        `Essa URL já está cadastrada na vaga ${duplicada.slug}.`,
        { sourceUrl: ['URL já cadastrada.'] },
      )
    }

    // O id sai daqui em vez do banco porque o slug precisa dele (doc 02).
    const id = randomUUID()
    const empresa = await nomeDaEmpresa(tx, entrada.companyId)

    const [criada] = await tx
      .insert(jobs)
      .values({
        ...camposDaVaga(entrada),
        id,
        slug: jobSlug(entrada.title, empresa, id),
        // Nasce rascunho: publicar é uma decisão à parte (doc 06).
        status: 'draft',
        createdBy: usuario.id,
      })
      .returning({ id: jobs.id, slug: jobs.slug })

    if (!criada) throw new FalhaDaAction('not_found', 'Não conseguimos criar a vaga.')

    await gravarVinculos(tx, id, entrada.technologyIds, entrada.tagIds)

    return {
      data: criada,
      entityId: id,
      diff: { criada: { title: entrada.title, empresa, slug: criada.slug } },
    }
  },
})

export const atualizarVaga = defineAction({
  nome: 'job.update',
  entidade: 'job',
  papelMinimo: 'editor',
  schema: atualizarVagaSchema,
  revalidar: TAGS_DE_CACHE,
  async executar({ entrada, tx }) {
    const anterior = await vagaExistente(tx, entrada.id)
    const hash = hashDaUrl(entrada.sourceUrl)

    const [conflito] = await tx
      .select({ id: jobs.id, slug: jobs.slug })
      .from(jobs)
      .where(eq(jobs.sourceUrlHash, hash))
      .limit(1)

    if (conflito && conflito.id !== entrada.id) {
      throw new FalhaDaAction(
        'duplicate_job',
        `Essa URL já está cadastrada na vaga ${conflito.slug}.`,
        { sourceUrl: ['URL já cadastrada.'] },
      )
    }

    // O slug não é recalculado: a URL é permanente (doc 02) e trocá-la aqui
    // quebraria links já compartilhados e indexados.
    const [atualizada] = await tx
      .update(jobs)
      .set(camposDaVaga(entrada))
      .where(eq(jobs.id, entrada.id))
      .returning({ id: jobs.id, slug: jobs.slug })

    if (!atualizada) throw new FalhaDaAction('not_found', 'Vaga não encontrada.')

    await gravarVinculos(tx, entrada.id, entrada.technologyIds, entrada.tagIds)

    return {
      data: atualizada,
      entityId: entrada.id,
      diff: {
        de: { title: anterior.title },
        para: { title: entrada.title },
      },
    }
  },
})

/**
 * Fábrica das transições de status. Todas mudam a mesma coluna e auditam o
 * mesmo par de valores; escrever quatro vezes só multiplicaria a chance de
 * uma delas esquecer a auditoria.
 */
function transicao(config: {
  nome: string
  paraStatus: 'published' | 'archived' | 'rejected' | 'draft'
  /** Status de onde a transição faz sentido; vazio significa qualquer um. */
  deStatus?: readonly string[]
  mensagemInvalida: string
}) {
  return defineAction({
    nome: config.nome,
    entidade: 'job',
    papelMinimo: 'editor',
    schema: transicaoDeVagaSchema,
    revalidar: TAGS_DE_CACHE,
    async executar({ entrada, tx }) {
      const anterior = await vagaExistente(tx, entrada.id)

      if (config.deStatus && !config.deStatus.includes(anterior.status)) {
        throw new FalhaDaAction('validation_error', config.mensagemInvalida)
      }

      const [vaga] = await tx
        .update(jobs)
        .set({
          status: config.paraStatus,
          // `published_at`, `expires_at` e `archived_at` são carimbados por
          // trigger (migration 0007); aqui só entra o que o admin escolheu.
          ...(config.paraStatus === 'published' && entrada.expiresAt
            ? { expiresAt: new Date(entrada.expiresAt) }
            : {}),
          // Republicar precisa limpar o carimbo de arquivamento, senão a vaga
          // volta ao ar marcada como arquivada.
          ...(config.paraStatus === 'published' ? { archivedAt: null } : {}),
        })
        .where(eq(jobs.id, entrada.id))
        .returning({ id: jobs.id, slug: jobs.slug, status: jobs.status })

      if (!vaga) throw new FalhaDaAction('not_found', 'Vaga não encontrada.')

      return {
        data: vaga,
        entityId: entrada.id,
        diff: { de: anterior.status, para: config.paraStatus },
      }
    },
  })
}

export const publicarVaga = transicao({
  nome: 'job.publish',
  paraStatus: 'published',
  mensagemInvalida: 'Esta vaga já está publicada.',
  deStatus: ['draft', 'pending_review', 'archived', 'rejected'],
})

export const arquivarVaga = transicao({
  nome: 'job.archive',
  paraStatus: 'archived',
  mensagemInvalida: 'Só dá para arquivar uma vaga publicada.',
  deStatus: ['published'],
})

export const rejeitarVaga = transicao({
  nome: 'job.reject',
  paraStatus: 'rejected',
  mensagemInvalida: 'Só dá para rejeitar rascunho ou vaga em revisão.',
  deStatus: ['draft', 'pending_review'],
})

export const restaurarVaga = transicao({
  nome: 'job.restore',
  paraStatus: 'draft',
  mensagemInvalida: 'Esta vaga já é um rascunho.',
  deStatus: ['archived', 'rejected', 'published'],
})

export const excluirVaga = defineAction({
  nome: 'job.delete',
  entidade: 'job',
  // Papel mais alto que o resto do CRUD: apagar não tem volta (doc 06).
  papelMinimo: 'admin',
  schema: excluirVagaSchema,
  revalidar: TAGS_DE_CACHE,
  async executar({ entrada, tx }) {
    const vaga = await vagaExistente(tx, entrada.id)

    // A policy `jobs_delete_admin` diz o mesmo em SQL; a regra vive nos dois
    // lugares de propósito, para não depender de a action lembrar.
    if (!['draft', 'rejected'].includes(vaga.status)) {
      throw new FalhaDaAction(
        'validation_error',
        'Só rascunho e vaga rejeitada podem ser excluídos. Arquive as demais.',
      )
    }

    await tx.delete(jobTechnologies).where(eq(jobTechnologies.jobId, entrada.id))
    await tx.delete(jobTags).where(eq(jobTags.jobId, entrada.id))
    await tx.delete(jobs).where(eq(jobs.id, entrada.id))

    return {
      data: { slug: vaga.slug },
      entityId: entrada.id,
      diff: { excluida: { slug: vaga.slug, title: vaga.title, status: vaga.status } },
    }
  },
})
