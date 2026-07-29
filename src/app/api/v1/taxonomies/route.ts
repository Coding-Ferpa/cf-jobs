import type { NextRequest } from 'next/server'

import { limitarCliente } from '@/db/queries/rate-limit'
import { getTaxonomies } from '@/db/queries/taxonomies'
import { CACHE_DE_TAXONOMIAS, respostaDePreflight, respostaJson } from '@/lib/api/http'
import { erroInterno, limiteExcedido } from '@/lib/api/problem'
import { cabecalhosDeLimite, LIMITE_DE_LEITURA } from '@/lib/api/rate-limit'
import type { Taxonomias } from '@/lib/api/schemas'

/**
 * `GET /api/v1/taxonomies` — vocabulário dos filtros (doc 06). Cache de 1h:
 * taxonomia muda quando a curadoria cadastra algo novo, não a cada minuto.
 */

const INSTANCIA = '/api/v1/taxonomies'

export async function GET(request: NextRequest) {
  try {
    const limite = await limitarCliente(request.headers, 'api', LIMITE_DE_LEITURA)
    const cabecalhos = cabecalhosDeLimite(limite)

    if (!limite.permitido) return limiteExcedido(INSTANCIA, cabecalhos)

    // A anotação não é decorativa: é ela que faz o TypeScript recusar uma query
    // que devolva forma diferente da publicada no OpenAPI.
    const taxonomias: Taxonomias = await getTaxonomies()

    return respostaJson(taxonomias, { cache: CACHE_DE_TAXONOMIAS, cabecalhos })
  } catch (erro) {
    console.error('[api:taxonomies]', erro)
    return erroInterno(INSTANCIA)
  }
}

export function OPTIONS() {
  return respostaDePreflight()
}
