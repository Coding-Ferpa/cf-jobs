import { describe, expect, it } from 'vitest'

import { decodeCursor, encodeCursor } from '@/lib/cursor'

const CURSOR = {
  publishedAt: new Date('2026-07-20T12:00:00.000Z'),
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
}

describe('cursor de paginação', () => {
  it('sobrevive à ida e volta', () => {
    const decodificado = decodeCursor(encodeCursor(CURSOR))

    expect(decodificado?.id).toBe(CURSOR.id)
    expect(decodificado?.publishedAt.toISOString()).toBe(CURSOR.publishedAt.toISOString())
  })

  it('é opaco para quem lê a URL', () => {
    const codificado = encodeCursor(CURSOR)

    expect(codificado).not.toContain(CURSOR.id)
    // base64url não usa +, / nem =, então cabe em querystring sem escapar.
    expect(codificado).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('trata cursor inválido como ausente em vez de quebrar a página', () => {
    const invalidos = [
      null,
      undefined,
      '',
      'nao-e-base64!!',
      Buffer.from('{"p":"2026-07-20","i":"nao-e-uuid"}').toString('base64url'),
      Buffer.from('sem json nenhum').toString('base64url'),
      Buffer.from(
        '{"p":"data-invalida","i":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"}',
      ).toString('base64url'),
      Buffer.from('{}').toString('base64url'),
    ]

    for (const invalido of invalidos) {
      expect(decodeCursor(invalido)).toBeNull()
    }
  })
})
