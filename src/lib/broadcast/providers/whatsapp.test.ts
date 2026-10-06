// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetEnvCache } from '@/lib/env'
import { formatJobWhatsAppMessage, WhatsAppProvider } from './whatsapp'
import type { JobBroadcastPayload } from '../types'

describe('WhatsAppProvider', () => {
  const vagaCompleta: JobBroadcastPayload = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    slug: 'desenvolvedor-frontend-empresa-x-1234',
    title: 'Desenvolvedor Frontend Sênior',
    companyName: 'Empresa X',
    workModeLabel: 'Remoto',
    seniorityLabel: 'Sênior',
    contractTypeLabel: 'CLT',
    locationCity: 'São Paulo',
    locationState: 'SP',
    locationCountry: 'BR',
    salaryMin: '12000.00',
    salaryMax: '15000.00',
    salaryCurrency: 'BRL',
    salaryPeriod: 'month',
    technologies: ['React', 'TypeScript', 'Next.js'],
    summary: 'Vaga para atuar no desenvolvimento de produtos escaláveis.',
    applyUrl: 'https://empresa.gupy.io/job/123',
    siteUrl: 'https://vagas.codingferpa.com.br',
  }

  describe('formatJobWhatsAppMessage', () => {
    it('formata uma vaga completa com todos os campos estruturados', () => {
      const mensagem = formatJobWhatsAppMessage(vagaCompleta)

      expect(mensagem).toContain('🚀 *Nova Vaga de Tecnologia!*')
      expect(mensagem).toContain('📌 *Desenvolvedor Frontend Sênior*')
      expect(mensagem).toContain('🏢 *Empresa:* Empresa X')
      expect(mensagem).toContain(
        '💼 *Modelo:* Remoto • *Nível:* Sênior • *Contrato:* CLT',
      )
      expect(mensagem).toContain('📍 *Local:* São Paulo - SP - BR')
      expect(mensagem).toContain('💰 *Salário:*')
      expect(mensagem).toContain('12.000')
      expect(mensagem).toContain('15.000')
      expect(mensagem).toContain('💻 *Tecnologias:* React, TypeScript, Next.js')
      expect(mensagem).toContain(
        '📝 _Vaga para atuar no desenvolvimento de produtos escaláveis._',
      )
      expect(mensagem).toContain(
        'https://vagas.codingferpa.com.br/vagas/desenvolvedor-frontend-empresa-x-1234',
      )
    })

    it('formata vaga sem salário e sem resumo usando applyUrl como fallback', () => {
      const vagaMinima: JobBroadcastPayload = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        slug: 'backend-dev-abc-5678',
        title: 'Backend Dev',
        companyName: 'ABC Tech',
        applyUrl: 'https://boards.greenhouse.io/abc/123',
      }

      const mensagem = formatJobWhatsAppMessage(vagaMinima)

      expect(mensagem).toContain('📌 *Backend Dev*')
      expect(mensagem).toContain('🏢 *Empresa:* ABC Tech')
      expect(mensagem).not.toContain('💰 *Salário:*')
      expect(mensagem).toContain(
        '🔗 *Link para candidatura:*\nhttps://boards.greenhouse.io/abc/123',
      )
    })
  })

  describe('send', () => {
    const originalEnv = { ...process.env }
    const baseServerEnv = {
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      DATABASE_URL: 'postgresql://postgres@localhost:6543/postgres',
      DIRECT_URL: 'postgresql://postgres@localhost:5432/postgres',
      CRON_SECRET: 'segredo-com-16-chars',
    }

    beforeEach(() => {
      vi.resetModules()
      _resetEnvCache()
      process.env = { ...originalEnv, ...baseServerEnv }
    })

    afterEach(() => {
      _resetEnvCache()
      process.env = { ...originalEnv }
      vi.restoreAllMocks()
    })

    it('retorna skipped quando credenciais do WhatsApp não estão configuradas', async () => {
      delete process.env.WHATSAPP_ACCESS_TOKEN
      delete process.env.WHATSAPP_PHONE_NUMBER_ID

      const provider = new WhatsAppProvider()
      const resultado = await provider.send(vagaCompleta)

      expect(resultado.ok).toBe(false)
      expect(resultado.skipped).toBe(true)
      expect(resultado.reason).toContain('não estão configuradas')
    })

    it('dispara para o grupo de teste quando targetEnvironment é test', async () => {
      process.env.WHATSAPP_ACCESS_TOKEN = 'test_token'
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789'
      process.env.WHATSAPP_GROUP_ID_TEST = 'group_test_id'
      process.env.WHATSAPP_GROUP_ID_PROD = 'group_prod_id'

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          messages: [{ id: 'wamid.HBgL12345' }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const provider = new WhatsAppProvider()
      const resultado = await provider.send(vagaCompleta, { targetEnvironment: 'test' })

      expect(resultado.ok).toBe(true)
      expect(resultado.messageId).toBe('wamid.HBgL12345')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"to":"group_test_id"'),
        }),
      )
    })

    it('dispara para o grupo oficial quando targetEnvironment é prod', async () => {
      process.env.WHATSAPP_ACCESS_TOKEN = 'test_token'
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789'
      process.env.WHATSAPP_GROUP_ID_TEST = 'group_test_id'
      process.env.WHATSAPP_GROUP_ID_PROD = 'group_prod_id'

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          messages: [{ id: 'wamid.HBgL67890' }],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const provider = new WhatsAppProvider()
      const resultado = await provider.send(vagaCompleta, { targetEnvironment: 'prod' })

      expect(resultado.ok).toBe(true)
      expect(resultado.messageId).toBe('wamid.HBgL67890')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"to":"group_prod_id"'),
        }),
      )
    })

    it('trata erros da Meta Graph API graciosamente', async () => {
      process.env.WHATSAPP_ACCESS_TOKEN = 'test_token'
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789'
      process.env.WHATSAPP_GROUP_ID_TEST = 'group_test_id'

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Invalid Group ID',
            code: 100,
          },
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const provider = new WhatsAppProvider()
      const resultado = await provider.send(vagaCompleta, { targetEnvironment: 'test' })

      expect(resultado.ok).toBe(false)
      expect(resultado.error).toBe('Invalid Group ID')
    })
  })
})
