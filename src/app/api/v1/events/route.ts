import { sql } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { queryAsAnon } from '@/db/client'
import { requireAnalyticsSalt } from '@/lib/env'
import { ipDaRequisicao, visitorHash } from '@/lib/visitor'

/**
 * Beacon de analytics first-party (docs 06 e 09).
 *
 * O cliente manda apenas o que viu; quem deriva a identidade anônima é o
 * servidor — assim o navegador nunca carrega identificador nosso e nenhum IP é
 * persistido. Responde 202 mesmo em duplicata: contagem é problema do banco,
 * não do beacon.
 */

const RATE_LIMIT_POR_MINUTO = 20

const corpoSchema = z.object({
  job_slug: z.string().min(1).max(200),
  event_type: z.enum(['view', 'click_apply', 'share']),
  referrer: z.string().max(500).optional(),
  utm_source: z.string().max(100).optional(),
})

function problema(status: number, title: string, detail: string) {
  return NextResponse.json(
    { type: 'about:blank', title, status, detail, instance: '/api/v1/events' },
    { status, headers: { 'content-type': 'application/problem+json' } },
  )
}

export async function POST(request: NextRequest) {
  let corpo: unknown
  try {
    corpo = await request.json()
  } catch {
    return problema(400, 'Corpo inválido', 'O corpo precisa ser JSON.')
  }

  const entrada = corpoSchema.safeParse(corpo)
  if (!entrada.success) {
    return problema(400, 'Evento inválido', 'Confira job_slug e event_type.')
  }

  let salt: string
  try {
    salt = requireAnalyticsSalt()
  } catch {
    return problema(
      503,
      'Analytics indisponível',
      'O registro de eventos não está configurado neste ambiente.',
    )
  }

  const ip = ipDaRequisicao(request.headers)
  const hashDoVisitante = visitorHash({
    ip,
    userAgent: request.headers.get('user-agent') ?? '',
    salt,
  })

  const { job_slug: slug, event_type: tipo, referrer, utm_source: utm } = entrada.data

  try {
    const permitido = await queryAsAnon(async (tx) => {
      const limite = await tx.execute<{ permitido: boolean }>(sql`
        select public.check_rate_limit(
          ${`events:${hashDoVisitante}`},
          ${RATE_LIMIT_POR_MINUTO},
          interval '1 minute'
        ) as permitido
      `)

      const linhas = limite as unknown as { permitido: boolean }[]
      if (!linhas[0]?.permitido) return false

      // O índice parcial de dedup resolve repetição no mesmo dia; o insert
      // referencia a vaga por slug para não confiar em id vindo do cliente.
      await tx.execute(sql`
        insert into public.job_events (job_id, event_type, referrer, utm_source, visitor_hash)
        select j.id, ${tipo}::public.event_type, ${referrer ?? null}, ${utm ?? null}, ${hashDoVisitante}
          from public.jobs j
         where j.slug = ${slug}
        on conflict do nothing
      `)

      return true
    })

    if (!permitido) {
      return problema(429, 'Muitas requisições', 'Aguarde um instante e tente de novo.')
    }
  } catch {
    return problema(500, 'Erro ao registrar evento', 'Tente de novo em instantes.')
  }

  return new NextResponse(null, { status: 202 })
}
