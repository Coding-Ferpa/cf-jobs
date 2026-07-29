/**
 * Verificação da importação com chaves reais — uma vaga pública de cada ATS.
 *
 * Roda o mesmo `executarPipeline` do admin, com o mesmo repositório e o mesmo
 * catálogo: o que muda é só quem dispara. As vagas ficam em `pending_review`,
 * como no fluxo normal — nada é publicado.
 *
 * ```
 * pnpm exec tsx --conditions=react-server --env-file=.env \
 *   scripts/verificar-import-real.ts
 * ```
 *
 * Não vira script do `package.json` de propósito: cada execução gasta chamadas
 * de verdade. `ORCAMENTO_MS` afrouxa os 55s do pipeline quando o objetivo é
 * medir quanto os modelos realmente precisam (ADR-0017).
 *
 * **As URLs envelhecem.** Vaga real sai do ar; ao reexecutar, troque por
 * anúncios abertos no momento — um 404 aqui não é defeito do pipeline.
 */

import { randomUUID } from 'node:crypto'

import { db } from '../src/db/client'
import { repositorioDoPipeline } from '../src/db/queries/import-pipeline'
import { lerListasParaOPrompt } from '../src/db/queries/taxonomies'
import { catalogoDoBanco } from '../src/db/queries/taxonomy-catalog'
import { jobImports } from '../src/db/schema'
import { ClienteNim } from '../src/features/import/nim'
import { executarPipeline } from '../src/features/import/pipeline'
import { jsonSchemaDaVaga } from '../src/features/import/schema'
import { requireAiEnv } from '../src/lib/env'
import { hashDaUrl } from '../src/lib/source-url'

const ADMIN_LOCAL = '00000000-0000-4000-8000-000000000001'

const ALVOS = [
  ['greenhouse', 'https://job-boards.greenhouse.io/gitlab/jobs/8503792002'],
  ['lever', 'https://jobs.lever.co/ciandt/d6842900-4e55-4bcf-a539-c6173059fd9c'],
  ['ashby', 'https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2'],
  ['gupy', 'https://gaudium.gupy.io/jobs/11081863'],
] as const

async function main() {
  const ai = requireAiEnv()
  const jsonSchema = jsonSchemaDaVaga()
  const listas = await lerListasParaOPrompt()

  console.log('modelos:', ai.models.join(' → '))
  console.log('chaves em rodízio:', ai.apiKeys.length)
  console.log('')

  for (const [ats, url] of ALVOS) {
    const [criada] = await db
      .insert(jobImports)
      .values({
        id: randomUUID(),
        url,
        urlHash: hashDaUrl(url),
        status: 'queued',
        requestedBy: ADMIN_LOCAL,
      })
      .returning({ id: jobImports.id })

    const importId = criada!.id
    const comecou = Date.now()

    const clientes: ClienteNim[] = []
    const resultado = await executarPipeline(
      { importId, url, criadoPor: ADMIN_LOCAL },
      {
        repositorio: repositorioDoPipeline(),
        catalogo: catalogoDoBanco(),
        listas,
        // Só para a medição: quanto tempo estes modelos realmente precisam.
        orcamentoMs: Number(process.env.ORCAMENTO_MS ?? 55_000),
        criarCliente: (orcamentoRestanteMs) => {
          const cliente = new ClienteNim({
            apiKeys: ai.apiKeys,
            models: ai.models,
            jsonSchema,
            orcamentoRestanteMs,
            ...(ai.baseURL ? { baseURL: ai.baseURL } : {}),
          })
          clientes.push(cliente)
          return cliente
        },
      },
    )

    const [linha] = await db.query.jobImports.findMany({
      where: (tabela, { eq }) => eq(tabela.id, importId),
      limit: 1,
    })

    const resposta = linha?.aiResponse as { confidence?: number } | null

    console.log(`── ${ats} ${'─'.repeat(50 - ats.length)}`)
    console.log(`   url        ${url}`)
    console.log(`   estado     ${resultado.estado}`)
    if (resultado.estado === 'failed') {
      console.log(`   etapa      ${resultado.etapa} (retomável: ${resultado.retomavel})`)
      console.log(`   mensagem   ${resultado.mensagem}`)
    } else if (resultado.estado === 'review') {
      console.log(`   vaga       ${resultado.slug}`)
      console.log(
        `   avisos     ${resultado.avisos.length ? resultado.avisos.join(' | ') : '—'}`,
      )
    }
    console.log(`   adapter    ${linha?.sourceSite ?? '—'}`)
    console.log(`   modelo     ${linha?.model ?? '—'}`)
    console.log(
      `   tokens     in ${linha?.tokensIn ?? '—'} / out ${linha?.tokensOut ?? '—'}`,
    )
    console.log(`   latência   ${linha?.latencyMs ?? Date.now() - comecou}ms`)
    console.log(`   confiança  ${resposta?.confidence ?? '—'}`)

    for (const cliente of clientes) {
      for (const modelo of ai.models) {
        const suporte = cliente.suporte(modelo)
        console.log(
          `   schema     ${modelo}: ${suporte === undefined ? 'não testado' : suporte ? 'aceito' : 'recusado'}`,
        )
      }
    }
    console.log('')
  }

  process.exit(0)
}

void main()
