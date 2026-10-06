import { whatsAppProvider } from './providers/whatsapp'
import type {
  BroadcastChannel,
  BroadcastChannelConfig,
  BroadcastProvider,
  BroadcastResult,
  BroadcastTargetEnvironment,
  JobBroadcastPayload,
} from './types'

export * from './types'
export { formatJobWhatsAppMessage, whatsAppProvider } from './providers/whatsapp'

/**
 * Catálogo de canais de divulgação disponíveis no sistema.
 *
 * Para adicionar um novo canal à UI, basta registrar sua configuração aqui e
 * plugar a implementação do seu `BroadcastProvider` no mapa `PROVIDERS`.
 */
export const AVAILABLE_CHANNELS: BroadcastChannelConfig[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Envia a vaga formatada para o grupo do WhatsApp da comunidade.',
    defaultEnabled: true,
    supportsEnvironments: true,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Envia para o canal ou grupo do Telegram (preparado para expansão).',
    defaultEnabled: false,
    supportsEnvironments: true,
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Envia para o canal de vagas do Discord (preparado para expansão).',
    defaultEnabled: false,
    supportsEnvironments: false,
  },
]

const PROVIDERS: Record<BroadcastChannel, BroadcastProvider | undefined> = {
  whatsapp: whatsAppProvider,
  telegram: undefined,
  discord: undefined,
}

/**
 * Dispara a notificação da vaga para todos os canais selecionados.
 */
export async function dispatchJobBroadcast(
  job: JobBroadcastPayload,
  channels: BroadcastChannel[],
  options?: { targetEnvironment?: BroadcastTargetEnvironment },
): Promise<BroadcastResult[]> {
  if (!channels || channels.length === 0) return []

  const resultados: BroadcastResult[] = []

  for (const channel of channels) {
    const provider = PROVIDERS[channel]
    if (!provider) {
      resultados.push({
        channel,
        ok: false,
        skipped: true,
        reason: `Provedor de divulgação para o canal "${channel}" ainda não foi habilitado.`,
      })
      continue
    }

    try {
      const resultado = await provider.send(job, options)
      resultados.push(resultado)
    } catch (err) {
      resultados.push({
        channel,
        ok: false,
        error:
          err instanceof Error ? err.message : 'Erro inesperado ao disparar notificação.',
      })
    }
  }

  return resultados
}
