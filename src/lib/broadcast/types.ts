/**
 * Contrato agnóstico de canais de divulgação (Broadcast).
 *
 * Permite adicionar novos canais (WhatsApp, Telegram, Discord, etc.)
 * implementando a interface `BroadcastProvider`.
 */

export type BroadcastChannel = 'whatsapp' | 'telegram' | 'discord'

export type BroadcastTargetEnvironment = 'test' | 'prod'

export type JobBroadcastPayload = {
  id: string
  slug: string
  title: string
  companyName: string
  locationCity?: string | null
  locationState?: string | null
  locationCountry?: string | null
  workModeLabel?: string | null
  seniorityLabel?: string | null
  contractTypeLabel?: string | null
  salaryMin?: string | null
  salaryMax?: string | null
  salaryCurrency?: string | null
  salaryPeriod?: 'hour' | 'month' | 'year' | null
  technologies?: string[]
  summary?: string | null
  applyUrl: string
  siteUrl?: string
}

export type BroadcastResult = {
  channel: BroadcastChannel
  ok: boolean
  messageId?: string | null
  error?: string | null
  skipped?: boolean
  reason?: string
}

export type BroadcastChannelConfig = {
  id: BroadcastChannel
  name: string
  description: string
  defaultEnabled: boolean
  supportsEnvironments: boolean
}

export interface BroadcastProvider {
  readonly channel: BroadcastChannel
  readonly name: string
  isConfigured(): boolean
  send(
    job: JobBroadcastPayload,
    options?: { targetEnvironment?: BroadcastTargetEnvironment },
  ): Promise<BroadcastResult>
}
