/**
 * Cache e CORS da API v1 (doc 06).
 *
 * O `s-maxage` de cada família vem do doc; o `stale-while-revalidate` acompanha
 * o mesmo valor, para que uma resposta velha nunca seja servida por mais tempo
 * do que ela foi considerada fresca.
 */

export const CACHE_DE_LISTAGEM = 'public, s-maxage=60, stale-while-revalidate=300'
export const CACHE_DE_DETALHE = 'public, s-maxage=300, stale-while-revalidate=300'
export const CACHE_DE_TAXONOMIAS = 'public, s-maxage=3600, stale-while-revalidate=3600'

/** Leitura é aberta a qualquer origem: são dados públicos, e divulgar é o ponto. */
export const CORS_DE_LEITURA: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

export function respostaJson(
  dados: unknown,
  opcoes: { cache: string; cabecalhos?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(dados), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': opcoes.cache,
      ...CORS_DE_LEITURA,
      ...opcoes.cabecalhos,
    },
  })
}

/** Preflight das leituras: responde o contrato de CORS e nada mais. */
export function respostaDePreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_DE_LEITURA })
}

/**
 * O beacon de eventos é restrito ao próprio site (doc 06). A ausência de
 * `Origin` é aceita de propósito: navegador sempre manda em POST, então quem
 * chega sem ele é cliente de servidor — e para esse a defesa que vale é o rate
 * limit, não um cabeçalho que ele mesmo escolheria.
 */
export function origemPermitida(origem: string | null, siteUrl: string): boolean {
  if (origem === null || origem === '') return true

  try {
    return new URL(origem).origin === new URL(siteUrl).origin
  } catch {
    return false
  }
}
