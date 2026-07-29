/**
 * Sonda os modelos da cascata com uma chamada real cada (doc 05, ADR-0017).
 *
 * Responde três perguntas que nenhum teste com dublê responde: o modelo existe
 * para esta conta, ele aceita `response_format: json_schema`, e quanto demora
 * para uma resposta curta. É o que precede fixar um modelo como padrão no
 * código — o `moonshotai/kimi-k2.6` estava lá e devolvia 404.
 *
 * ```
 * pnpm exec tsx --env-file=.env scripts/sondar-modelos.ts
 * pnpm exec tsx --env-file=.env scripts/sondar-modelos.ts meta/llama-3.3-70b-instruct
 * ```
 *
 * Sem argumentos sonda a cascata do `.env`; com argumentos, só os modelos
 * pedidos — é como se investiga um candidato antes de promovê-lo a padrão.
 * `TIMEOUT_MS` afrouxa o corte quando o objetivo é separar "recusou o schema"
 * de "não respondeu a tempo": são coisas diferentes e a distinção decide se o
 * modelo entra na cascata.
 *
 * Fora do `package.json` de propósito: cada execução gasta chamadas de verdade.
 */

import { requireAiEnv } from '../src/lib/env'
import { ENDPOINT } from '../src/features/import/nim'

/** Schema mínimo: o que interessa é o endpoint aceitar, não o conteúdo. */
const SCHEMA = {
  type: 'object',
  properties: {
    cidade: { type: 'string' },
    pais: { type: 'string' },
  },
  required: ['cidade', 'pais'],
  additionalProperties: false,
} as const

const PERGUNTA =
  'Responda em JSON com a cidade e o país da sede da comunidade Coding Ferpa, ' +
  'que fica em Recife, Pernambuco, Brasil.'

type Resultado = {
  modelo: string
  comSchema: boolean
  ok: boolean
  status?: number
  latenciaMs: number
  resposta?: string
  erro?: string
}

async function sondar(
  modelo: string,
  chave: string,
  baseURL: string,
  comSchema: boolean,
): Promise<Resultado> {
  const comecou = Date.now()

  try {
    const resposta = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${chave}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: 'user', content: PERGUNTA }],
        temperature: 0.1,
        max_tokens: 200,
        ...(comSchema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'local', schema: SCHEMA },
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(Number(process.env.TIMEOUT_MS ?? 90_000)),
    })

    const corpo = await resposta.text()
    const latenciaMs = Date.now() - comecou

    if (!resposta.ok) {
      return {
        modelo,
        comSchema,
        ok: false,
        status: resposta.status,
        latenciaMs,
        erro: corpo.slice(0, 240).replace(/\s+/g, ' '),
      }
    }

    const json = JSON.parse(corpo) as {
      choices?: { message?: { content?: string } }[]
    }

    return {
      modelo,
      comSchema,
      ok: true,
      status: resposta.status,
      latenciaMs,
      resposta: (json.choices?.[0]?.message?.content ?? '').slice(0, 120).trim(),
    }
  } catch (erro) {
    return {
      modelo,
      comSchema,
      ok: false,
      latenciaMs: Date.now() - comecou,
      erro: (erro as Error).message,
    }
  }
}

async function main() {
  const ai = requireAiEnv()
  const baseURL = ai.baseURL ?? ENDPOINT
  const chave = ai.apiKeys[0]!
  const pedidos = process.argv.slice(2)
  const modelos = pedidos.length > 0 ? pedidos : ai.models

  console.log(`endpoint: ${baseURL}`)
  console.log(`modelos:  ${modelos.join(' → ')}`)
  console.log('')

  for (const modelo of modelos) {
    for (const comSchema of [true, false]) {
      const resultado = await sondar(modelo, chave, baseURL, comSchema)
      const rotulo = comSchema ? 'json_schema' : 'sem schema '

      console.log(
        `${resultado.ok ? 'OK   ' : 'FALHA'} ${modelo.padEnd(28)} ${rotulo} ` +
          `${String(resultado.status ?? '—').padStart(3)} ` +
          `${String(resultado.latenciaMs).padStart(6)}ms ` +
          `${resultado.ok ? resultado.resposta : resultado.erro}`,
      )
    }
  }

  process.exit(0)
}

void main()
