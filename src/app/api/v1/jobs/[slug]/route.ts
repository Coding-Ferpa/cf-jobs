import type { NextRequest } from 'next/server'

import { getJobBySlug } from '@/db/queries/jobs'
import { limitarCliente } from '@/db/queries/rate-limit'
import { CACHE_DE_DETALHE, respostaDePreflight, respostaJson } from '@/lib/api/http'
import { erroInterno, limiteExcedido, naoEncontrado } from '@/lib/api/problem'
import { cabecalhosDeLimite, LIMITE_DE_LEITURA } from '@/lib/api/rate-limit'
import { vagaDetalhada } from '@/lib/api/serialize'
import { clientEnv } from '@/lib/env'

/**
 * `GET /api/v1/jobs/{slug}` — detalhe completo (doc 06).
 *
 * Vaga arquivada responde 200 com `status: "archived"`, de propósito: quem
 * integrou uma vaga precisa saber que ela fechou, e um 404 seria indistinguível
 * de slug errado.
 */

type Parametros = { params: Promise<{ slug: string }> }

export async function GET(request: NextRequest, { params }: Parametros) {
  const { slug } = await params
  const instancia = `/api/v1/jobs/${slug}`

  try {
    const limite = await limitarCliente(request.headers, 'api', LIMITE_DE_LEITURA)
    const cabecalhos = cabecalhosDeLimite(limite)

    if (!limite.permitido) return limiteExcedido(instancia, cabecalhos)

    // Rascunho e rejeitada não chegam aqui: a leitura roda como `anon` e a RLS
    // só entrega published e archived (doc 07).
    const vaga = await getJobBySlug(slug)
    if (!vaga) {
      return naoEncontrado(instancia, 'Não existe vaga publicada com esse slug.')
    }

    return respostaJson(vagaDetalhada(vaga, clientEnv().NEXT_PUBLIC_SITE_URL), {
      cache: CACHE_DE_DETALHE,
      cabecalhos,
    })
  } catch (erro) {
    console.error('[api:jobs/slug]', erro)
    return erroInterno(instancia)
  }
}

export function OPTIONS() {
  return respostaDePreflight()
}
