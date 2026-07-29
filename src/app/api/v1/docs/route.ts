import { ApiReference } from '@scalar/nextjs-api-reference'

import { buildContentSecurityPolicy } from '@/lib/security-headers'

/**
 * `GET /api/v1/docs` — a referência navegável da API (doc 06).
 *
 * O bundle da UI vem de `/scalar/api-reference.js`, servido pela nossa própria
 * origem (ver `scripts/copy-scalar.ts`), e não do CDN que o adaptador usa por
 * padrão.
 *
 * A CSP é carimbada aqui porque o `proxy.ts` não cobre `/api/*` — para JSON
 * isso não faz diferença, mas esta rota devolve HTML com script, e HTML sem
 * CSP é justamente o que o doc 07 (A05) não quer. `'unsafe-inline'` continua
 * necessário: o Scalar inicializa por script inline e estiliza por atributo
 * `style`, e esta rota é estática, sem nonce por requisição (ADR-0012).
 */

const referencia = ApiReference({
  url: '/api/v1/openapi.json',
  cdn: '/scalar/api-reference.js',
  pageTitle: 'CF Jobs API v1',
})

export function GET() {
  const resposta = referencia()

  resposta.headers.set(
    'content-security-policy',
    buildContentSecurityPolicy({ isDev: process.env.NODE_ENV === 'development' }),
  )

  return resposta
}
