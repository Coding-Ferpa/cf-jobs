import { describe, expect, it } from 'vitest'

import { cabecalhosDeLimite, chaveDeLimite, type ResultadoDeLimite } from './rate-limit'

const AGORA = new Date('2026-07-29T12:00:00.000Z')
const EPOCH_AGORA = Math.floor(AGORA.getTime() / 1000)

function resultado(parcial: Partial<ResultadoDeLimite> = {}): ResultadoDeLimite {
  return {
    permitido: true,
    limite: 60,
    restantes: 59,
    reiniciaEm: EPOCH_AGORA + 42,
    ...parcial,
  }
}

describe('cabecalhosDeLimite', () => {
  it('publica limite, saldo e reinício', () => {
    expect(cabecalhosDeLimite(resultado(), AGORA)).toEqual({
      'x-ratelimit-limit': '60',
      'x-ratelimit-remaining': '59',
      'x-ratelimit-reset': String(EPOCH_AGORA + 42),
    })
  })

  it('não manda Retry-After quando a requisição passou', () => {
    expect(cabecalhosDeLimite(resultado(), AGORA)['retry-after']).toBeUndefined()
  })

  it('manda Retry-After com os segundos que faltam quando barra', () => {
    const cabecalhos = cabecalhosDeLimite(
      resultado({ permitido: false, restantes: 0 }),
      AGORA,
    )

    expect(cabecalhos['retry-after']).toBe('42')
    expect(cabecalhos['x-ratelimit-remaining']).toBe('0')
  })

  it('nunca pede espera menor que um segundo', () => {
    const cabecalhos = cabecalhosDeLimite(
      resultado({ permitido: false, reiniciaEm: EPOCH_AGORA - 5 }),
      AGORA,
    )

    expect(cabecalhos['retry-after']).toBe('1')
  })

  it('não publica saldo negativo', () => {
    const cabecalhos = cabecalhosDeLimite(
      resultado({ permitido: false, restantes: -3 }),
      AGORA,
    )

    expect(cabecalhos['x-ratelimit-remaining']).toBe('0')
  })
})

describe('chaveDeLimite', () => {
  it('separa o saldo de leitura do saldo de eventos', () => {
    expect(chaveDeLimite('api', 'abc')).not.toBe(chaveDeLimite('events', 'abc'))
  })
})
