import { describe, expect, it } from 'vitest'

import { AVAILABLE_CHANNELS, dispatchJobBroadcast } from './index'
import type { JobBroadcastPayload } from './types'

describe('broadcast subsystem', () => {
  const vagaExemplo: JobBroadcastPayload = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    slug: 'tech-lead-1234',
    title: 'Tech Lead',
    companyName: 'Coding Ferpa',
    applyUrl: 'https://exemplo.com/vaga',
  }

  it('lista os canais disponíveis contendo WhatsApp, Telegram e Discord', () => {
    const ids = AVAILABLE_CHANNELS.map((c) => c.id)
    expect(ids).toContain('whatsapp')
    expect(ids).toContain('telegram')
    expect(ids).toContain('discord')

    const whatsapp = AVAILABLE_CHANNELS.find((c) => c.id === 'whatsapp')
    expect(whatsapp?.defaultEnabled).toBe(true)
    expect(whatsapp?.supportsEnvironments).toBe(true)
  })

  it('retorna array vazio quando nenhum canal é passado', async () => {
    const resultados = await dispatchJobBroadcast(vagaExemplo, [])
    expect(resultados).toEqual([])
  })

  it('retorna skipped para canais sem provedor implementado ainda (ex: telegram)', async () => {
    const resultados = await dispatchJobBroadcast(vagaExemplo, ['telegram', 'discord'])

    expect(resultados).toHaveLength(2)
    expect(resultados[0]?.channel).toBe('telegram')
    expect(resultados[0]?.ok).toBe(false)
    expect(resultados[0]?.skipped).toBe(true)
    expect(resultados[0]?.reason).toContain('ainda não foi habilitado')

    expect(resultados[1]?.channel).toBe('discord')
    expect(resultados[1]?.ok).toBe(false)
    expect(resultados[1]?.skipped).toBe(true)
  })
})
