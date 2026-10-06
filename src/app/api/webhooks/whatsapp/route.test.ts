// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetEnvCache } from '@/lib/env'
import { GET, POST } from './route'

describe('WhatsApp Webhook API Route', () => {
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

  describe('GET (Webhook Handshake)', () => {
    it('retorna 500 se WHATSAPP_WEBHOOK_VERIFY_TOKEN não estiver configurado', async () => {
      delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=my_token&hub.challenge=1158201444',
      )
      const res = await GET(req)

      expect(res.status).toBe(500)
    })

    it('retorna o hub.challenge com status 200 quando token for válido', async () => {
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'secret_webhook_token_123'

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=secret_webhook_token_123&hub.challenge=1158201444',
      )
      const res = await GET(req)

      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toBe('1158201444')
    })

    it('retorna 403 Forbidden se o verify_token estiver incorreto', async () => {
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'secret_webhook_token_123'

      const req = new NextRequest(
        'http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=1158201444',
      )
      const res = await GET(req)

      expect(res.status).toBe(403)
    })
  })

  describe('POST (Webhook Status & Messages)', () => {
    it('recebe e processa payload de status de mensagem de grupo retornando 200 OK', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_ID_123',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550234567',
                    phone_number_id: '756079150920219',
                  },
                  statuses: [
                    {
                      id: 'wamid.HBgLM123456',
                      recipient_id:
                        'Y2FwaV9ncm91cDoxNzA1NTU1MDEzOToxMjAzNjM0MDQ2OTQyMzM4MjAZD',
                      recipient_type: 'group',
                      status: 'delivered',
                      timestamp: '1700000000',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const req = new NextRequest('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const res = await POST(req)

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toEqual({ success: true })
    })

    it('retorna 400 em caso de payload JSON inválido', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        body: 'invalid-json-string',
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
    })
  })
})
