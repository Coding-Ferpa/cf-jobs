import { NextResponse, type NextRequest } from 'next/server'

import { buildContentSecurityPolicy } from '@/lib/security-headers'

/**
 * Rotas sempre renderizadas dinamicamente (doc 08) — só nelas o Next consegue
 * aplicar o nonce nos scripts que injeta. Ver ADR-0012.
 */
const ROTAS_COM_NONCE = ['/admin', '/login']

export function middleware(request: NextRequest) {
  const usaNonce = ROTAS_COM_NONCE.some((rota) =>
    request.nextUrl.pathname.startsWith(rota),
  )
  const nonce = usaNonce ? crypto.randomUUID().replaceAll('-', '') : undefined

  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })

  const requestHeaders = new Headers(request.headers)
  if (nonce) {
    // O Next lê a CSP dos headers da requisição para carimbar o nonce nos scripts.
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('content-security-policy', csp)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', csp)

  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
