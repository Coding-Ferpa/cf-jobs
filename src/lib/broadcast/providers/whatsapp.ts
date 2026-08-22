import { isWhatsAppConfigured, resolveWhatsAppEnv, serverEnv } from '@/lib/env'
import { formatarSalario } from '@/lib/format'
import type {
  BroadcastProvider,
  BroadcastResult,
  BroadcastTargetEnvironment,
  JobBroadcastPayload,
} from '../types'

/**
 * Formata a vaga em Markdown compatível com WhatsApp.
 */
export function formatJobWhatsAppMessage(job: JobBroadcastPayload): string {
  const linhas: string[] = []

  linhas.push(`🚀 *Nova Vaga de Tecnologia!*`)
  linhas.push(`📌 *${job.title.trim()}*`)
  linhas.push(`🏢 *Empresa:* ${job.companyName.trim()}`)

  const detalhes: string[] = []
  if (job.workModeLabel) detalhes.push(`*Modelo:* ${job.workModeLabel}`)
  if (job.seniorityLabel) detalhes.push(`*Nível:* ${job.seniorityLabel}`)
  if (job.contractTypeLabel) detalhes.push(`*Contrato:* ${job.contractTypeLabel}`)

  if (detalhes.length > 0) {
    linhas.push(`💼 ${detalhes.join(' • ')}`)
  }

  const localizacao = [job.locationCity, job.locationState, job.locationCountry]
    .filter(Boolean)
    .join(' - ')
  if (localizacao) {
    linhas.push(`📍 *Local:* ${localizacao}`)
  }

  const salario = formatarSalario({
    min: job.salaryMin ?? null,
    max: job.salaryMax ?? null,
    currency: job.salaryCurrency ?? null,
    period: job.salaryPeriod ?? 'month',
  })
  if (salario) {
    linhas.push(`💰 *Salário:* ${salario}`)
  }

  if (job.technologies && job.technologies.length > 0) {
    linhas.push(`💻 *Tecnologias:* ${job.technologies.join(', ')}`)
  }

  if (job.summary && job.summary.trim().length > 0) {
    linhas.push(``)
    linhas.push(`📝 _${job.summary.trim()}_`)
  }

  linhas.push(``)
  if (job.siteUrl) {
    const urlVaga = job.siteUrl.endsWith('/')
      ? `${job.siteUrl}vagas/${job.slug}`
      : `${job.siteUrl}/vagas/${job.slug}`
    linhas.push(`🔗 *Ver detalhes da vaga:*\n${urlVaga}`)
  } else if (job.applyUrl) {
    linhas.push(`🔗 *Link para candidatura:*\n${job.applyUrl}`)
  }

  return linhas.join('\n')
}

export class WhatsAppProvider implements BroadcastProvider {
  readonly channel = 'whatsapp' as const
  readonly name = 'WhatsApp'

  isConfigured(): boolean {
    return isWhatsAppConfigured()
  }

  async send(
    job: JobBroadcastPayload,
    options?: { targetEnvironment?: BroadcastTargetEnvironment },
  ): Promise<BroadcastResult> {
    const env = serverEnv()
    if (!isWhatsAppConfigured(env)) {
      return {
        channel: 'whatsapp',
        ok: false,
        skipped: true,
        reason: 'Credenciais do WhatsApp não estão configuradas no .env.',
      }
    }

    const whatsappEnv = resolveWhatsAppEnv(env)
    const targetEnv = options?.targetEnvironment ?? whatsappEnv.defaultGroup
    const groupId =
      targetEnv === 'prod'
        ? whatsappEnv.groupIdProd || whatsappEnv.groupIdTest
        : whatsappEnv.groupIdTest || whatsappEnv.groupIdProd

    if (!groupId) {
      return {
        channel: 'whatsapp',
        ok: false,
        skipped: true,
        reason: `ID do grupo de WhatsApp para o ambiente "${targetEnv}" não está configurado.`,
      }
    }

    const bodyText = formatJobWhatsAppMessage(job)
    const url = `https://graph.facebook.com/${whatsappEnv.apiVersion}/${whatsappEnv.phoneNumberId}/messages`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${whatsappEnv.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'group',
          to: groupId,
          type: 'text',
          text: {
            preview_url: true,
            body: bodyText,
          },
        }),
      })

      const data = (await response.json()) as {
        messaging_product?: string
        messages?: { id: string }[]
        error?: {
          message: string
          type?: string
          code?: number
          error_data?: { details?: string }
        }
      }

      if (!response.ok || data.error) {
        const errorMsg =
          data.error?.message ||
          data.error?.error_data?.details ||
          `Erro HTTP ${response.status} ao enviar mensagem para grupo WhatsApp.`
        return {
          channel: 'whatsapp',
          ok: false,
          error: errorMsg,
        }
      }

      const messageId = data.messages?.[0]?.id ?? null
      return {
        channel: 'whatsapp',
        ok: true,
        messageId,
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Falha na conexão com a API do WhatsApp.'
      return {
        channel: 'whatsapp',
        ok: false,
        error: errorMsg,
      }
    }
  }
}

export const whatsAppProvider = new WhatsAppProvider()
