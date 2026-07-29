import { createHash } from 'node:crypto'

/**
 * Identificação anônima de visitante (doc 07).
 *
 * O hash junta IP, user agent, o dia e um sal secreto. Não guardamos IP em
 * lugar nenhum, e a troca de dia rotaciona o identificador — dá para contar
 * visitantes únicos do dia sem conseguir seguir alguém entre dias.
 */
export function visitorHash(entrada: {
  ip: string
  userAgent: string
  salt: string
  agora?: Date
}): string {
  const dia = (entrada.agora ?? new Date()).toISOString().slice(0, 10)

  return createHash('sha256')
    .update(`${entrada.ip}|${entrada.userAgent}|${dia}|${entrada.salt}`)
    .digest('hex')
}

/**
 * IP de quem chamou. Na Vercel vem em `x-forwarded-for`; o primeiro endereço é
 * o cliente, os seguintes são proxies.
 */
export function ipDaRequisicao(headers: Headers): string {
  const encaminhado = headers.get('x-forwarded-for')
  if (encaminhado) {
    const primeiro = encaminhado.split(',')[0]?.trim()
    if (primeiro) return primeiro
  }

  return headers.get('x-real-ip')?.trim() || 'desconhecido'
}
