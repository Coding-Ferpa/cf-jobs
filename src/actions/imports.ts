'use server'

import { updateTag } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'

import { autorizar } from '@/actions/authorize'
import { actionError, actionOk, type ActionResult } from '@/actions/result'
import { db } from '@/db/client'
import { catalogoDoBanco } from '@/db/queries/taxonomy-catalog'
import { repositorioDoPipeline } from '@/db/queries/import-pipeline'
import { buscarImportacao } from '@/db/queries/imports'
import { tokensDoMes } from '@/db/queries/import-stats'
import { listasParaOPrompt } from '@/db/queries/taxonomies'
import { auditLogs, jobImports } from '@/db/schema'
import { avaliarOrcamento } from '@/features/import/budget'
import { ClienteNim } from '@/features/import/nim'
import { executarPipeline } from '@/features/import/pipeline'
import { jsonSchemaDaVaga } from '@/features/import/schema'
import { consumirLimite } from '@/db/queries/rate-limit'
import { chaveDeLimite, LIMITE_DE_IMPORTACAO } from '@/lib/api/rate-limit'
import { getCurrentUser } from '@/lib/auth'
import { requireAiEnv } from '@/lib/env'
import {
  iniciarImportacaoSchema,
  processarImportacaoSchema,
  repetirImportacaoSchema,
} from '@/lib/schemas/import'
import { hashDaUrl } from '@/lib/source-url'
import { z } from '@/lib/zod'

/**
 * As actions da importação (docs 02, 05 e 06).
 *
 * Elas **não** usam o esqueleto do `defineAction`, e isso é deliberado: o
 * esqueleto roda tudo dentro de uma transação, e o pipeline precisa do
 * contrário — cada etapa precisa estar comitada e visível para o polling da
 * barra de progresso enquanto a função ainda roda.
 *
 * Por isso são duas actions em vez de uma: `iniciarImportacao` grava a fila e
 * devolve o id na hora, e `processarImportacao` faz o trabalho longo. Quem
 * chama tem o id para acompanhar antes de o processamento terminar.
 */

const TAGS_DE_CACHE = ['jobs']

/**
 * Estado do teto mensal. Fica aqui, e não no `env`, porque depende do consumo
 * já gravado — e o `AI_MONTHLY_TOKEN_BUDGET` pode simplesmente não existir.
 */
async function avaliarOrcamentoDoMes() {
  const { entrada, saida } = await tokensDoMes()

  let teto: number | null = null
  try {
    teto = requireAiEnv().monthlyTokenBudget
  } catch {
    // Sem chave configurada não há orçamento a avaliar; quem reclama disso é
    // o `processarImportacao`, com a mensagem certa.
  }

  return avaliarOrcamento({ tokensIn: entrada, tokensOut: saida, teto })
}

type Sessao = Awaited<ReturnType<typeof getCurrentUser>>

async function exigirEditor(): Promise<
  { usuario: NonNullable<Sessao> } | { erro: ActionResult<never> }
> {
  const usuario = await getCurrentUser()
  const negado = autorizar(usuario, 'editor')

  if (negado) return { erro: negado as ActionResult<never> }
  if (!usuario) return { erro: actionError('unauthorized', 'Sua sessão expirou.') }

  return { usuario }
}

async function auditar(entrada: {
  actorId: string
  action: string
  entityId: string
  diff: unknown
}) {
  await db.insert(auditLogs).values({
    actorId: entrada.actorId,
    action: entrada.action,
    entity: 'job_import',
    entityId: entrada.entityId,
    diff: entrada.diff,
  })
}

export type ImportacaoIniciada = { importId: string }

/**
 * Cria a linha da fila e devolve o id. É a parte rápida: quem submeteu o
 * formulário precisa do id para começar a acompanhar o progresso.
 */
export async function iniciarImportacao(
  entrada: z.input<typeof iniciarImportacaoSchema>,
): Promise<ActionResult<ImportacaoIniciada>> {
  const sessao = await exigirEditor()
  if ('erro' in sessao) return sessao.erro

  const validada = iniciarImportacaoSchema.safeParse(entrada)
  if (!validada.success) {
    return actionError(
      'validation_error',
      'Confira o endereço da vaga.',
      z.flattenError(validada.error).fieldErrors as Record<string, string[]>,
    )
  }

  // Bloqueio suave do orçamento (doc 05): só existe se o mantenedor definiu um
  // teto, e mesmo aí é um "confirma?" — o tier gratuito não cobra por token, e
  // travar de vez uma importação legítima seria pior que o gasto.
  const orcamento = await avaliarOrcamentoDoMes()
  if (orcamento.exigeConfirmacao && !validada.data.confirmarOrcamento) {
    return actionError(
      'budget_exceeded',
      `O consumo do mês (${orcamento.tokensDoMes.toLocaleString('pt-BR')} tokens) ` +
        `passou do teto configurado. Confirme para importar mesmo assim.`,
    )
  }

  // Teto de 5 por minuto por pessoa (doc 05): mantém o consumo das duas chaves
  // gratuitas do NIM longe do limite de 40 req/min de cada conta.
  const limite = await consumirLimite(
    chaveDeLimite('import', sessao.usuario.id),
    LIMITE_DE_IMPORTACAO,
  )

  if (!limite.permitido) {
    return actionError(
      'rate_limited',
      `Limite de ${LIMITE_DE_IMPORTACAO} importações por minuto. Aguarde alguns segundos.`,
    )
  }

  try {
    const [criada] = await db
      .insert(jobImports)
      .values({
        url: validada.data.url,
        urlHash: hashDaUrl(validada.data.url),
        status: 'queued',
        requestedBy: sessao.usuario.id,
      })
      .returning({ id: jobImports.id })

    if (!criada) {
      return actionError('validation_error', 'Não conseguimos abrir a importação.')
    }

    await auditar({
      actorId: sessao.usuario.id,
      action: 'import.start',
      entityId: criada.id,
      diff: { url: validada.data.url },
    })

    return actionOk({ importId: criada.id })
  } catch (erro) {
    unstable_rethrow(erro)
    console.error('[action:import.start]', erro)
    return actionError('validation_error', 'Não conseguimos abrir a importação.')
  }
}

export type ImportacaoConcluida =
  | {
      estado: 'review'
      jobId: string
      slug: string
      avisos: string[]
      baixaConfianca: boolean
    }
  | { estado: 'duplicada'; slug: string; title: string }

/**
 * A parte longa: busca, extrai, classifica, mapeia e persiste. Roda até 55s e
 * grava cada etapa em `job_imports` enquanto anda.
 */
export async function processarImportacao(
  entrada: z.input<typeof processarImportacaoSchema>,
): Promise<ActionResult<ImportacaoConcluida>> {
  const sessao = await exigirEditor()
  if ('erro' in sessao) return sessao.erro

  const validada = processarImportacaoSchema.safeParse(entrada)
  if (!validada.success) return actionError('not_found', 'Importação não encontrada.')

  const importacao = await buscarImportacao(validada.data.importId)
  if (!importacao) return actionError('not_found', 'Importação não encontrada.')

  let ai: ReturnType<typeof requireAiEnv>
  try {
    ai = requireAiEnv()
  } catch (erro) {
    // Configuração faltando é problema de quem opera, não do formulário: a
    // mensagem do `requireAiEnv` diz exatamente o que fazer.
    return actionError('ai_failed', (erro as Error).message)
  }

  const jsonSchema = jsonSchemaDaVaga()

  const resultado = await executarPipeline(
    {
      importId: importacao.id,
      url: importacao.url,
      criadoPor: sessao.usuario.id,
    },
    {
      repositorio: repositorioDoPipeline(),
      catalogo: catalogoDoBanco(),
      listas: await listasParaOPrompt(),
      criarCliente: (orcamentoRestanteMs) =>
        new ClienteNim({
          apiKeys: ai.apiKeys,
          models: ai.models,
          jsonSchema,
          orcamentoRestanteMs,
          ...(ai.baseURL ? { baseURL: ai.baseURL } : {}),
        }),
    },
  )

  if (resultado.estado === 'failed') {
    return actionError(
      resultado.etapa === 'classifying' ? 'ai_failed' : 'fetch_failed',
      resultado.mensagem,
    )
  }

  if (resultado.estado === 'duplicada') {
    return actionOk({
      estado: 'duplicada' as const,
      slug: resultado.vaga.slug,
      title: resultado.vaga.title,
    })
  }

  await auditar({
    actorId: sessao.usuario.id,
    action: 'import.review',
    entityId: importacao.id,
    diff: { jobId: resultado.jobId, slug: resultado.slug, avisos: resultado.avisos },
  })

  // A vaga nasce `pending_review` e não aparece na área pública, mas o admin
  // lista por status — e é essa listagem que precisa vê-la agora.
  for (const tag of TAGS_DE_CACHE) updateTag(tag)

  return actionOk({
    estado: 'review' as const,
    jobId: resultado.jobId,
    slug: resultado.slug,
    avisos: resultado.avisos,
    baixaConfianca: resultado.baixaConfianca,
  })
}

/**
 * "Tentar novamente" (doc 05): abre um `job_imports` novo com `attempt + 1`
 * para a URL da tentativa anterior. O cache de conteúdo de 24h faz a retomada
 * pular o fetch — o processamento é o mesmo.
 */
export async function repetirImportacao(
  entrada: z.input<typeof repetirImportacaoSchema>,
): Promise<ActionResult<ImportacaoIniciada>> {
  const sessao = await exigirEditor()
  if ('erro' in sessao) return sessao.erro

  const validada = repetirImportacaoSchema.safeParse(entrada)
  if (!validada.success) return actionError('not_found', 'Importação não encontrada.')

  const anterior = await buscarImportacao(validada.data.importId)
  if (!anterior) return actionError('not_found', 'Importação não encontrada.')

  const limite = await consumirLimite(
    chaveDeLimite('import', sessao.usuario.id),
    LIMITE_DE_IMPORTACAO,
  )

  if (!limite.permitido) {
    return actionError(
      'rate_limited',
      `Limite de ${LIMITE_DE_IMPORTACAO} importações por minuto. Aguarde alguns segundos.`,
    )
  }

  const [criada] = await db
    .insert(jobImports)
    .values({
      url: anterior.url,
      urlHash: hashDaUrl(anterior.url),
      status: 'queued',
      attempt: anterior.attempt + 1,
      requestedBy: sessao.usuario.id,
    })
    .returning({ id: jobImports.id })

  if (!criada) return actionError('validation_error', 'Não conseguimos repetir.')

  await auditar({
    actorId: sessao.usuario.id,
    action: 'import.retry',
    entityId: criada.id,
    diff: { de: anterior.id, attempt: anterior.attempt + 1 },
  })

  return actionOk({ importId: criada.id })
}
