'use server'

import { updateTag } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { after } from 'next/server'

import { autorizar } from '@/actions/authorize'
import { actionError, actionOk, type ActionResult } from '@/actions/result'
import { db } from '@/db/client'
import { catalogoDoBanco } from '@/db/queries/taxonomy-catalog'
import { repositorioDoPipeline } from '@/db/queries/import-pipeline'
import { buscarImportacao, buscarVagaPorHash } from '@/db/queries/imports'
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
import { ORCAMENTO_DA_IMPORTACAO_MS } from '@/lib/import-runtime'
import { iniciarImportacaoSchema, repetirImportacaoSchema } from '@/lib/schemas/import'
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
 * **O trabalho longo não é esperado pela resposta** (doc 02, revisado pós-M6):
 * a action grava a fila, devolve o id e entrega o pipeline ao `after()`, que a
 * plataforma mantém vivo na mesma invocação até o `maxDuration` da rota. Medido
 * em campo: 28s a 129s por importação no tier gratuito do NIM — segurar a
 * resposta por isso deixaria o formulário pendurado e, pior, bloquearia as
 * outras Server Actions do mesmo cliente, que o Next serializa.
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
    // a própria `iniciarImportacao`, com a mensagem certa.
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

export type ImportacaoDespachada = { estado: 'processando'; importId: string }

export type ImportacaoIniciada =
  ImportacaoDespachada | { estado: 'duplicada'; slug: string; title: string }

/**
 * Cria a linha da fila, entrega o pipeline ao `after()` e devolve o id na hora.
 * Quem submeteu o formulário precisa do id para começar a acompanhar o
 * progresso — o resto acontece com a resposta já enviada.
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

  // Configuração faltando é problema de quem opera, não do formulário — e é
  // melhor dizer isso agora do que gravar uma tentativa que já nasce condenada.
  try {
    requireAiEnv()
  } catch (erro) {
    return actionError('ai_failed', (erro as Error).message)
  }

  // O dedup do doc 05 não depende de buscar nada: é o hash da URL canônica
  // contra `jobs.source_url_hash`. Feito aqui, a resposta já sai com o link da
  // vaga existente em vez de abrir uma tentativa para descobrir o óbvio.
  const jaCadastrada = await buscarVagaPorHash(hashDaUrl(validada.data.url))
  if (jaCadastrada) {
    return actionOk({
      estado: 'duplicada' as const,
      slug: jaCadastrada.slug,
      title: jaCadastrada.title,
    })
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

    despachar({
      importId: criada.id,
      url: validada.data.url,
      criadoPor: sessao.usuario.id,
    })

    return actionOk({ estado: 'processando' as const, importId: criada.id })
  } catch (erro) {
    unstable_rethrow(erro)
    console.error('[action:import.start]', erro)
    return actionError('validation_error', 'Não conseguimos abrir a importação.')
  }
}

/**
 * Entrega o pipeline ao `after()`: ele roda com a resposta já enviada, na mesma
 * invocação, até o `maxDuration` da rota (doc 02).
 *
 * Nada é devolvido a quem chamou porque não há mais ninguém esperando — o
 * resultado, inclusive a falha, mora em `job_imports`, que é de onde a barra de
 * progresso lê. Um erro aqui que não chegasse ao banco deixaria a tela girando
 * para sempre; por isso o `catch` grava antes de logar.
 */
function despachar(entrada: { importId: string; url: string; criadoPor: string }): void {
  after(async () => {
    const repositorio = repositorioDoPipeline()

    let ai: ReturnType<typeof requireAiEnv>
    try {
      ai = requireAiEnv()
    } catch (erro) {
      // A mensagem do `requireAiEnv` diz exatamente o que configurar; trocá-la
      // por um "algo deu errado" genérico esconderia a única pista útil.
      await repositorio.falhar(entrada.importId, {
        etapa: 'classifying',
        mensagem: (erro as Error).message,
        latenciaMs: 0,
      })
      return
    }

    try {
      const jsonSchema = jsonSchemaDaVaga()

      const resultado = await executarPipeline(entrada, {
        repositorio,
        catalogo: catalogoDoBanco(),
        listas: await listasParaOPrompt(),
        orcamentoMs: ORCAMENTO_DA_IMPORTACAO_MS,
        criarCliente: (orcamentoRestanteMs) =>
          new ClienteNim({
            apiKeys: ai.apiKeys,
            models: ai.models,
            jsonSchema,
            orcamentoRestanteMs,
            ...(ai.baseURL ? { baseURL: ai.baseURL } : {}),
          }),
      })

      if (resultado.estado !== 'review') return

      await auditar({
        actorId: entrada.criadoPor,
        action: 'import.review',
        entityId: entrada.importId,
        diff: { jobId: resultado.jobId, slug: resultado.slug, avisos: resultado.avisos },
      })

      // A vaga nasce `pending_review` e não aparece na área pública, mas o
      // admin lista por status — e é essa listagem que precisa vê-la agora.
      for (const tag of TAGS_DE_CACHE) updateTag(tag)
    } catch (erro) {
      console.error('[import] falha fora do pipeline', erro)

      await repositorio
        .falhar(entrada.importId, {
          etapa: 'persisting',
          mensagem: 'Algo deu errado ao importar. Tente de novo em instantes.',
          latenciaMs: 0,
        })
        .catch((aoGravar) => {
          console.error('[import] falha ao gravar o erro da importação', aoGravar)
        })
    }
  })
}

/**
 * "Tentar novamente" (doc 05): abre um `job_imports` novo com `attempt + 1`
 * para a URL da tentativa anterior. O cache de conteúdo de 24h faz a retomada
 * pular o fetch — o processamento é o mesmo.
 */
export async function repetirImportacao(
  entrada: z.input<typeof repetirImportacaoSchema>,
): Promise<ActionResult<ImportacaoDespachada>> {
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

  despachar({
    importId: criada.id,
    url: anterior.url,
    criadoPor: sessao.usuario.id,
  })

  return actionOk({ estado: 'processando' as const, importId: criada.id })
}
