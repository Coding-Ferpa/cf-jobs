import { sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'

import { queryAsAnon } from '@/db/client'
import { limitarCliente } from '@/db/queries/rate-limit'
import { origemPermitida } from '@/lib/api/http'
import {
  entradaInvalida,
  erroInterno,
  indisponivel,
  limiteExcedido,
  proibido,
} from '@/lib/api/problem'
import { cabecalhosDeLimite, LIMITE_DE_EVENTOS } from '@/lib/api/rate-limit'
import { eventoSchema } from '@/lib/api/schemas'
import { clientEnv, requireAnalyticsSalt } from '@/lib/env'
import { ipDaRequisicao, visitorHash } from '@/lib/visitor'

/**
 * Beacon de analytics first-party (docs 06 e 09).
 *
 * O cliente manda apenas o que viu; quem deriva a identidade anônima é o
 * servidor — assim o navegador nunca carrega identificador nosso e nenhum IP é
 * persistido. Responde 202 mesmo em duplicata: contagem é problema do banco,
 * não do beacon.
 */

const INSTANCIA = '/api/v1/events'

export async function POST(request: NextRequest) {
  // Diferente das leituras, o beacon é do próprio site (doc 06).
  if (!origemPermitida(request.headers.get('origin'), clientEnv().NEXT_PUBLIC_SITE_URL)) {
    return proibido(INSTANCIA, 'Este endpoint aceita chamadas apenas do próprio site.')
  }

  let corpo: unknown
  try {
    corpo = await request.json()
  } catch {
    return entradaInvalida(INSTANCIA, 'O corpo precisa ser JSON.')
  }

  const entrada = eventoSchema.safeParse(corpo)
  if (!entrada.success) {
    return entradaInvalida(INSTANCIA, 'Confira job_slug e event_type.')
  }

  let salt: string
  try {
    salt = requireAnalyticsSalt()
  } catch {
    return indisponivel(
      INSTANCIA,
      'O registro de eventos não está configurado neste ambiente.',
    )
  }

  const hashDoVisitante = visitorHash({
    ip: ipDaRequisicao(request.headers),
    userAgent: request.headers.get('user-agent') ?? '',
    salt,
  })

  const { job_slug: slug, event_type: tipo, referrer, utm_source: utm } = entrada.data

  try {
    // O limite é por IP (doc 07), e não pelo hash do visitante: este rotaciona
    // por dia e por user agent, então serviria de gargalo para ninguém.
    const limite = await limitarCliente(request.headers, 'events', LIMITE_DE_EVENTOS)
    const cabecalhos = cabecalhosDeLimite(limite)

    if (!limite.permitido) return limiteExcedido(INSTANCIA, cabecalhos)

    // O índice parcial de dedup resolve repetição no mesmo dia; o insert
    // referencia a vaga por slug para não confiar em id vindo do cliente.
    await queryAsAnon(async (tx) => {
      await tx.execute(sql`
        insert into public.job_events (job_id, event_type, referrer, utm_source, visitor_hash)
        select j.id, ${tipo}::public.event_type, ${referrer ?? null}, ${utm ?? null}, ${hashDoVisitante}
          from public.jobs j
         where j.slug = ${slug}
        on conflict do nothing
      `)
    })

    return new Response(null, { status: 202, headers: cabecalhos })
  } catch {
    return erroInterno(INSTANCIA)
  }
}
