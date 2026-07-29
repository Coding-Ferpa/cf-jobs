import { describe, expect, it } from 'vitest'

import { safeRedirectPath } from '@/lib/redirect'

describe('safeRedirectPath', () => {
  it('aceita caminho interno', () => {
    expect(safeRedirectPath('/admin/vagas', '/admin')).toBe('/admin/vagas')
    expect(safeRedirectPath('/admin?status=draft', '/admin')).toBe('/admin?status=draft')
  })

  it('aceita hífen e acentuação, que são comuns nos nossos slugs', () => {
    expect(safeRedirectPath('/vagas/dev-backend-nubank-a1b2c3', '/admin')).toBe(
      '/vagas/dev-backend-nubank-a1b2c3',
    )
    expect(safeRedirectPath('/admin/taxonomias/tecnologias', '/admin')).toBe(
      '/admin/taxonomias/tecnologias',
    )
  })

  it('recusa destino externo', () => {
    const maliciosos = [
      'https://site-falso.test',
      '//site-falso.test',
      '/\\site-falso.test',
      'http://site-falso.test',
      'javascript:alert(1)',
      'site-falso.test',
    ]

    for (const destino of maliciosos) {
      expect(safeRedirectPath(destino, '/admin')).toBe('/admin')
    }
  })

  it('recusa caracteres de controle', () => {
    const comQuebraDeLinha = '/admin\nLocation: https://site-falso.test'
    const comRetorno = '/admin\r\n'
    const comNulo = `/admin${String.fromCharCode(0)}`

    expect(safeRedirectPath(comQuebraDeLinha, '/admin')).toBe('/admin')
    expect(safeRedirectPath(comRetorno, '/admin')).toBe('/admin')
    expect(safeRedirectPath(comNulo, '/admin')).toBe('/admin')
  })

  it('cai no destino padrão quando não há valor', () => {
    expect(safeRedirectPath(null, '/admin')).toBe('/admin')
    expect(safeRedirectPath(undefined, '/admin')).toBe('/admin')
    expect(safeRedirectPath('', '/admin')).toBe('/admin')
  })
})
