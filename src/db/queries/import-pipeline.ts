import 'server-only'

import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'

import { db, type Transaction } from '@/db/client'
import {
  companies,
  jobImports,
  jobs,
  jobTags,
  jobTechnologies,
  taxonomySuggestions,
} from '@/db/schema'
import { buscarConteudoEmCache, buscarVagaPorHash } from '@/db/queries/imports'
import type {
  DadosParaPersistir,
  Repositorio,
  VagaPersistida,
} from '@/features/import/pipeline'
import { jobSlug, kebab } from '@/lib/slug'

/**
 * O lado do banco do pipeline (doc 05, etapas 1 e 5).
 *
 * O `Repositorio` é uma porta justamente para esta parte poder ser SQL de
 * verdade: a etapa 5 é **uma transação só** — empresa, vaga, junções,
 * sugestões e o `job_imports` — porque uma vaga sem tecnologias, ou uma
 * importação marcada como concluída sem vaga, seria pior que uma falha limpa.
 *
 * As marcações de etapa ficam de fora dessa transação de propósito: elas
 * existem para a barra de progresso ver o pipeline avançar, e dentro de uma
 * transação ninguém veria nada até o commit.
 */

/** O que a IA extrai não é dinheiro exato: 2 casas bastam e a coluna é numeric(12,2). */
function comoNumerico(valor: number | null | undefined): string | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor.toFixed(2) : null
}

function textoOuNulo(valor: string | null | undefined): string | null {
  const limpo = valor?.trim()
  return limpo && limpo.length > 0 ? limpo : null
}

/**
 * Empresa é dado factual, não taxonomia: cria sem revisão, casando por
 * `lower(name)` como manda o doc 05.
 */
async function acharOuCriarEmpresa(tx: Transaction, nome: string): Promise<string> {
  const [existente] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(sql`lower(${companies.name}) = lower(${nome})`)
    .limit(1)

  if (existente) return existente.id

  const id = randomUUID()
  // O slug é único: duas empresas de nome parecido não podem colidir, e o
  // sufixo do id resolve sem inventar sufixo numérico.
  const base = kebab(nome).slice(0, 40)
  const slug = base.length > 0 ? `${base}-${id.slice(0, 4)}` : id

  await tx.insert(companies).values({ id, name: nome.trim(), slug })
  return id
}

async function gravarVinculos(
  tx: Transaction,
  jobId: string,
  technologyIds: string[],
  tagIds: string[],
) {
  if (technologyIds.length > 0) {
    await tx.insert(jobTechnologies).values(
      technologyIds.map((technologyId, indice) => ({
        jobId,
        technologyId,
        // A primeira é a principal do card (doc 04); a ordem veio do modelo.
        isPrimary: indice === 0,
      })),
    )
  }

  if (tagIds.length > 0) {
    await tx.insert(jobTags).values(tagIds.map((tagId) => ({ jobId, tagId })))
  }
}

/**
 * O índice único parcial de `taxonomy_suggestions` cobre só as pendentes: o
 * mesmo termo desconhecido em dez vagas gera uma sugestão, não dez. O conflito
 * é esperado, então é ignorado em vez de derrubar a importação inteira.
 */
async function gravarSugestoes(
  tx: Transaction,
  importId: string,
  sugestoes: DadosParaPersistir['mapa']['sugestoes'],
) {
  if (sugestoes.length === 0) return

  await tx
    .insert(taxonomySuggestions)
    .values(
      sugestoes.map((sugestao) => ({
        kind: sugestao.kind,
        suggestedLabel: sugestao.suggestedLabel,
        normalizedSlug: sugestao.normalizedSlug,
        context: sugestao.context,
        importId,
      })),
    )
    .onConflictDoNothing({
      target: [taxonomySuggestions.kind, taxonomySuggestions.normalizedSlug],
      // O predicado do índice parcial precisa vir junto para o Postgres saber
      // qual índice inferir.
      where: eq(taxonomySuggestions.status, 'pending'),
    })
}

async function persistirNaTransacao(
  tx: Transaction,
  dados: DadosParaPersistir,
): Promise<VagaPersistida> {
  const { vaga, mapa } = dados

  const companyId = await acharOuCriarEmpresa(tx, vaga.company_name)

  // O id sai daqui porque o slug precisa dele (doc 02).
  const id = randomUUID()
  const slug = jobSlug(vaga.title, vaga.company_name, id)

  await tx.insert(jobs).values({
    id,
    slug,
    title: vaga.title,
    companyId,
    descriptionMd: vaga.description_md,
    summary: vaga.summary,

    roleCategoryId: mapa.roleCategoryId,
    seniorityId: mapa.seniorityId,
    workModeId: mapa.workModeId,
    contractTypeId: mapa.contractTypeId,

    locationCity: textoOuNulo(vaga.location.city),
    locationState: textoOuNulo(vaga.location.state),
    locationCountry: textoOuNulo(vaga.location.country),

    salaryMin: comoNumerico(vaga.salary.min),
    salaryMax: comoNumerico(vaga.salary.max),
    salaryCurrency: textoOuNulo(vaga.salary.currency),
    ...(vaga.salary.period ? { salaryPeriod: vaga.salary.period } : {}),

    benefits: vaga.benefits,
    keywords: vaga.keywords,
    language: vaga.language,

    sourceUrl: dados.url,
    sourceUrlHash: dados.urlHash,
    sourceSite: dados.sourceSite,
    // Sem formulário próprio conhecido, candidatar-se é ir à origem (doc 04).
    applyUrl: dados.url,

    // Nasce em revisão: publicar é decisão humana explícita (doc 02).
    status: 'pending_review',
    createdBy: dados.criadoPor,
  })

  await gravarVinculos(tx, id, mapa.technologyIds, mapa.tagIds)
  await gravarSugestoes(tx, dados.importId, mapa.sugestoes)

  await tx
    .update(jobImports)
    .set({
      status: 'review',
      jobId: id,
      aiResponse: vaga,
      model: dados.uso.modelo,
      tokensIn: dados.uso.tokensIn,
      tokensOut: dados.uso.tokensOut,
      latencyMs: dados.latenciaMs,
      errorStep: null,
      errorMessage: null,
      finishedAt: new Date(),
    })
    .where(eq(jobImports.id, dados.importId))

  return { jobId: id, slug }
}

export function repositorioDoPipeline(): Repositorio {
  return {
    async vagaPorHash(urlHash) {
      const vaga = await buscarVagaPorHash(urlHash)
      return vaga ? { id: vaga.id, slug: vaga.slug, title: vaga.title } : null
    },

    async conteudoEmCache(urlHash) {
      const cache = await buscarConteudoEmCache(urlHash)
      return cache ? { rawContent: cache.rawContent, sourceSite: cache.sourceSite } : null
    },

    async marcarEtapa(importId, status) {
      // `persisting` não é um estado de `import_status`: é o rótulo interno do
      // trecho final, e quem o registra é o próprio `persistir`.
      if (status === 'persisting') return

      await db.update(jobImports).set({ status }).where(eq(jobImports.id, importId))
    },

    async guardarConteudo(importId, { rawContent, sourceSite }) {
      await db
        .update(jobImports)
        .set({ rawContent, sourceSite })
        .where(eq(jobImports.id, importId))
    },

    async persistir(dados) {
      return db.transaction(async (tx) => persistirNaTransacao(tx, dados))
    },

    async falhar(importId, { etapa, mensagem, latenciaMs }) {
      await db
        .update(jobImports)
        .set({
          status: 'failed',
          errorStep: etapa,
          errorMessage: mensagem,
          latencyMs: latenciaMs,
          finishedAt: new Date(),
        })
        .where(eq(jobImports.id, importId))
    },
  }
}
