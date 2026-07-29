import type { NextRequest } from 'next/server'

import { countJobs, listJobs } from '@/db/queries/jobs'
import { limitarCliente } from '@/db/queries/rate-limit'
import { CACHE_DE_LISTAGEM, respostaDePreflight, respostaJson } from '@/lib/api/http'
import { analisarConsulta, paraFiltros, primeiroErro } from '@/lib/api/jobs-query'
import { entradaInvalida, erroInterno, limiteExcedido } from '@/lib/api/problem'
import { cabecalhosDeLimite, LIMITE_DE_LEITURA } from '@/lib/api/rate-limit'
import { vagaDeLista } from '@/lib/api/serialize'
import { clientEnv } from '@/lib/env'

/**
 * `GET /api/v1/jobs` — listagem pública com filtros e cursor (doc 06).
 *
 * A área pública não passa por aqui: Server Components chamam `db/queries`
 * direto, sem um salto HTTP no meio. Esta rota existe para quem está de fora —
 * o bot do Discord, widgets da comunidade — e é por isso que ela tem contrato
 * versionado, CORS e rate limit, coisas que a home não precisa.
 */

const INSTANCIA = '/api/v1/jobs'

export async function GET(request: NextRequest) {
  const consulta = analisarConsulta(request.nextUrl.searchParams)
  if (!consulta.success) {
    return entradaInvalida(INSTANCIA, primeiroErro(consulta.error))
  }

  try {
    const limite = await limitarCliente(request.headers, 'api', LIMITE_DE_LEITURA)
    const cabecalhos = cabecalhosDeLimite(limite)

    if (!limite.permitido) return limiteExcedido(INSTANCIA, cabecalhos)

    const filtros = paraFiltros(consulta.data)
    const [lista, total] = await Promise.all([listJobs(filtros), countJobs(filtros)])
    const site = clientEnv().NEXT_PUBLIC_SITE_URL

    return respostaJson(
      {
        data: lista.jobs.map((vaga) => vagaDeLista(vaga, site)),
        page: { next_cursor: lista.nextCursor, has_more: lista.hasMore },
        // Satura no teto da contagem — daí o nome: é estimativa por contrato,
        // não promessa de número exato (doc 06).
        meta: { total_estimate: total },
      },
      { cache: CACHE_DE_LISTAGEM, cabecalhos },
    )
  } catch (erro) {
    console.error('[api:jobs]', erro)
    return erroInterno(INSTANCIA)
  }
}

export function OPTIONS() {
  return respostaDePreflight()
}
