/**
 * Limites da API pública (doc 07): 60 req/min/IP nas leituras, 20/min no
 * beacon de eventos. A contagem em si mora no Postgres — aqui ficam os números
 * do contrato e a tradução do resultado para os cabeçalhos `X-RateLimit-*`.
 */

export const LIMITE_DE_LEITURA = 60
export const LIMITE_DE_EVENTOS = 20
export const JANELA_EM_SEGUNDOS = 60

export type ResultadoDeLimite = {
  permitido: boolean
  limite: number
  restantes: number
  /** Quando a janela abre espaço de novo, em epoch de segundos. */
  reiniciaEm: number
}

/**
 * `Retry-After` só sai quando a requisição foi barrada: mandá-lo em resposta
 * bem-sucedida faria cliente educado dormir sem precisar.
 */
export function cabecalhosDeLimite(
  resultado: ResultadoDeLimite,
  agora = new Date(),
): Record<string, string> {
  const cabecalhos: Record<string, string> = {
    'x-ratelimit-limit': String(resultado.limite),
    'x-ratelimit-remaining': String(Math.max(resultado.restantes, 0)),
    'x-ratelimit-reset': String(resultado.reiniciaEm),
  }

  if (!resultado.permitido) {
    const segundos = resultado.reiniciaEm - Math.floor(agora.getTime() / 1000)
    cabecalhos['retry-after'] = String(Math.max(segundos, 1))
  }

  return cabecalhos
}

/**
 * Chave do balde. É prefixada por escopo para que leitura e beacon não
 * consumam o mesmo saldo, e o identificador já chega hasheado — a tabela
 * `rate_limits` nunca vê IP em claro (doc 07).
 */
export function chaveDeLimite(escopo: 'api' | 'events', identificador: string): string {
  return `${escopo}:${identificador}`
}
