import { type NextRequest, NextResponse } from 'next/server'

import { serverEnv } from '@/lib/env'

/**
 * Webhook oficial para WhatsApp Business Cloud API (Meta).
 *
 * GET: Validação do webhook pelo Meta (handshake com `hub.verify_token` e `hub.challenge`).
 * POST: Recebimento de notificações de status de mensagens em grupos (`sent`, `delivered`, `read`, `failed`)
 *       e mensagens recebidas no grupo.
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const env = serverEnv()
  const verifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (!verifyToken) {
    console.warn(
      '[WhatsApp Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN não está configurado no .env.',
    )
    return new NextResponse('Webhook verify token not configured', { status: 500 })
  }

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

export type WhatsAppWebhookStatus = {
  id: string
  recipient_id: string
  recipient_type?: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  errors?: Array<{
    code: number
    title: string
    message: string
    error_data?: { details?: string }
  }>
}

export type WhatsAppWebhookPayload = {
  object: string
  entry?: Array<{
    id: string
    changes?: Array<{
      value?: {
        messaging_product?: string
        metadata?: {
          display_phone_number?: string
          phone_number_id?: string
        }
        statuses?: WhatsAppWebhookStatus[]
        messages?: Array<{
          from: string
          group_id?: string
          id: string
          timestamp: string
          text?: { body: string }
          type: string
        }>
      }
      field?: string
    }>
  }>
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as WhatsAppWebhookPayload

    if (payload.object === 'whatsapp_business_account' && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        for (const change of entry.changes ?? []) {
          if (change.field === 'messages' && change.value) {
            // Processa atualizações de status de entrega/leitura em grupos
            const statuses = change.value.statuses ?? []
            for (const status of statuses) {
              if (status.status === 'failed') {
                console.error(
                  `[WhatsApp Webhook] Mensagem ${status.id} falhou no destinatário ${status.recipient_id} (${status.recipient_type ?? 'individual'}):`,
                  status.errors,
                )
              } else {
                console.info(
                  `[WhatsApp Webhook] Mensagem ${status.id} para ${status.recipient_id} (${status.recipient_type ?? 'individual'}) -> status: ${status.status}`,
                )
              }
            }

            // Processa mensagens recebidas se houver
            const messages = change.value.messages ?? []
            for (const msg of messages) {
              if (msg.group_id) {
                console.info(
                  `[WhatsApp Webhook] Mensagem recebida no grupo ${msg.group_id} de ${msg.from}: ${msg.type}`,
                )
              }
            }
          }
        }
      }
    }

    // A Meta exige resposta 200 rápida para não reenviar o webhook
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error('[WhatsApp Webhook] Erro ao processar payload:', err)
    return NextResponse.json(
      { success: false, error: 'invalid_payload' },
      { status: 400 },
    )
  }
}
