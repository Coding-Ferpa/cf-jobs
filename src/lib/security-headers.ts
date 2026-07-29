/**
 * Cabeçalhos de segurança da aplicação (doc 07 — A05 Security Misconfiguration).
 *
 * Módulo puro de propósito: não importa nada de `next/*` para poder ser usado
 * tanto pelo `next.config.ts` quanto pelo middleware, e testado isoladamente.
 */

export type SecurityHeader = { key: string; value: string }

/**
 * Cabeçalhos fixos, aplicados a todas as rotas pelo `next.config.ts`.
 * A CSP não está aqui porque depende do nonce gerado por requisição.
 */
export const staticSecurityHeaders: SecurityHeader[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

export type ContentSecurityPolicyOptions = {
  /**
   * Nonce por requisição, que o Next reaproveita nos scripts que injeta.
   * Só existe em rotas renderizadas dinamicamente: em HTML pré-renderizado
   * (SSG/ISR) o Next não tem como carimbar o nonce, e `strict-dynamic`
   * bloquearia todo o JavaScript da página. Ver ADR-0012.
   */
  nonce?: string
  /** Em desenvolvimento o Next precisa de `unsafe-eval` (HMR/React Refresh). */
  isDev: boolean
  /** Origem do Supabase, liberada em `connect-src` para auth e queries. */
  supabaseUrl?: string
}

const SELF = "'self'"

export function buildContentSecurityPolicy({
  nonce,
  isDev,
  supabaseUrl,
}: ContentSecurityPolicyOptions): string {
  const scriptSrc = nonce
    ? [SELF, `'nonce-${nonce}'`, "'strict-dynamic'"]
    : [SELF, "'unsafe-inline'"]
  if (isDev) scriptSrc.push("'unsafe-eval'")

  const connectSrc = [SELF]
  if (supabaseUrl) connectSrc.push(supabaseUrl)
  if (isDev) connectSrc.push('ws:')

  const directives: [string, string[]][] = [
    ['default-src', [SELF]],
    ['script-src', scriptSrc],
    // `next/font` e o Tailwind emitem <style> inline; o Next não aplica nonce em estilos.
    ['style-src', [SELF, "'unsafe-inline'"]],
    ['img-src', [SELF, 'blob:', 'data:', 'https:']],
    ['font-src', [SELF, 'data:']],
    ['connect-src', connectSrc],
    ['form-action', [SELF]],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', [SELF]],
    ['object-src', ["'none'"]],
  ]

  const policy = directives.map(([name, values]) => `${name} ${values.join(' ')}`)
  if (!isDev) policy.push('upgrade-insecure-requests')

  return policy.join('; ')
}
