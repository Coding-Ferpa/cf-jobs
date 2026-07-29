import { describe, expect, it } from 'vitest'

import {
  diasAteExpirar,
  formatarDataRelativa,
  formatarLocalizacao,
  formatarSalario,
} from '@/lib/format'

const AGORA = new Date('2026-07-28T12:00:00.000Z')

function horasAtras(horas: number) {
  return new Date(AGORA.getTime() - horas * 60 * 60 * 1000)
}

describe('formatarDataRelativa', () => {
  it('descreve a recência em português', () => {
    expect(formatarDataRelativa(horasAtras(0.2), AGORA)).toBe('agora há pouco')
    expect(formatarDataRelativa(horasAtras(1), AGORA)).toBe('há 1 hora')
    expect(formatarDataRelativa(horasAtras(5), AGORA)).toBe('há 5 horas')
    expect(formatarDataRelativa(horasAtras(30), AGORA)).toBe('ontem')
    expect(formatarDataRelativa(horasAtras(24 * 5), AGORA)).toBe('há 5 dias')
    expect(formatarDataRelativa(horasAtras(24 * 45), AGORA)).toBe('há 1 mês')
    expect(formatarDataRelativa(horasAtras(24 * 90), AGORA)).toBe('há 3 meses')
  })
})

describe('diasAteExpirar', () => {
  it('conta dias restantes e passa a negativo quando venceu', () => {
    expect(diasAteExpirar(new Date('2026-07-30T12:00:00.000Z'), AGORA)).toBe(2)
    expect(diasAteExpirar(new Date('2026-07-26T12:00:00.000Z'), AGORA)).toBe(-2)
  })
})

describe('formatarSalario', () => {
  const base = { currency: 'BRL', period: 'month' }

  it('formata faixa em real', () => {
    const texto = formatarSalario({ ...base, min: '15000', max: '22000' })

    expect(texto).toContain('15.000')
    expect(texto).toContain('22.000')
    expect(texto).toContain('/mês')
  })

  it('colapsa faixa de valor único', () => {
    const texto = formatarSalario({ ...base, min: '2200', max: '2200' })

    expect(texto).not.toContain('–')
    expect(texto).toContain('2.200')
  })

  it('descreve faixa aberta dos dois lados', () => {
    expect(formatarSalario({ ...base, min: '8000', max: null })).toContain('a partir de')
    expect(formatarSalario({ ...base, min: null, max: '8000' })).toContain('até')
  })

  it('devolve null quando não há faixa', () => {
    expect(
      formatarSalario({ min: null, max: null, currency: null, period: 'month' }),
    ).toBeNull()
  })
})

describe('formatarLocalizacao', () => {
  it('mostra cidade e estado quando existem', () => {
    expect(formatarLocalizacao({ city: 'São Paulo', state: 'SP', country: 'BR' })).toBe(
      'São Paulo, SP',
    )
  })

  it('usa a modalidade quando não há cidade', () => {
    expect(
      formatarLocalizacao({ city: null, state: null, country: 'BR' }, 'remoto'),
    ).toBe('Remoto')
  })

  it('cai para o país e não inventa lugar', () => {
    expect(formatarLocalizacao({ city: null, state: null, country: 'BR' })).toBe('Brasil')
    expect(formatarLocalizacao({ city: null, state: null, country: null })).toBeNull()
  })
})
