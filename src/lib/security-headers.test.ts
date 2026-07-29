import { describe, expect, it } from 'vitest'

import { buildContentSecurityPolicy, staticSecurityHeaders } from '@/lib/security-headers'

function directive(csp: string, name: string): string | undefined {
  return csp.split('; ').find((part) => part === name || part.startsWith(`${name} `))
}

describe('buildContentSecurityPolicy', () => {
  it('autoriza scripts apenas pelo nonce quando a rota é dinâmica', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc123', isDev: false })

    expect(directive(csp, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic'",
    )
  })

  it('sem nonce, permite os scripts inline do HTML pré-renderizado', () => {
    const csp = buildContentSecurityPolicy({ isDev: false })

    // `strict-dynamic` aqui bloquearia todo o JS da página (ADR-0012).
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain('strict-dynamic')
  })

  it('mantém as demais restrições mesmo sem nonce', () => {
    const csp = buildContentSecurityPolicy({ isDev: false })

    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'default-src')).toBe("default-src 'self'")
  })

  it('bloqueia enquadramento, base-uri e objetos', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc123', isDev: false })

    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
    expect(directive(csp, 'default-src')).toBe("default-src 'self'")
  })

  it('não libera unsafe-eval nem websocket em produção', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc123', isDev: false })

    expect(csp).not.toContain('unsafe-eval')
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'")
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('libera unsafe-eval e websocket somente em desenvolvimento', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc123', isDev: true })

    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' ws:")
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  it('inclui a origem do Supabase em connect-src quando informada', () => {
    const csp = buildContentSecurityPolicy({
      nonce: 'abc123',
      isDev: false,
      supabaseUrl: 'https://projeto.supabase.co',
    })

    expect(directive(csp, 'connect-src')).toBe(
      "connect-src 'self' https://projeto.supabase.co",
    )
  })
})

describe('staticSecurityHeaders', () => {
  it('cobre os cabeçalhos exigidos pelo doc 07', () => {
    const keys = staticSecurityHeaders.map((header) => header.key)

    expect(keys).toEqual([
      'X-Content-Type-Options',
      'Referrer-Policy',
      'X-Frame-Options',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ])
  })
})
