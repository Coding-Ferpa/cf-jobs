import { createHash } from 'node:crypto'

/**
 * Canonicalização e hash da URL de origem (doc 05, passo 3).
 *
 * `jobs.source_url_hash` é único: é o que impede a mesma vaga entrar duas vezes
 * por links que só diferem em parâmetro de campanha. Por isso a normalização
 * precisa ser estável — duas pessoas colando o mesmo anúncio com UTMs
 * diferentes têm que chegar ao mesmo hash.
 *
 * Módulo puro, sem Next e sem banco: o pipeline de importação (doc 02) usa o
 * mesmo código.
 */

/** Parâmetros de rastreamento removidos: não identificam a vaga. */
const PARAMETROS_DE_RASTREIO = ['gclid', 'fbclid', 'ref', 'src', 'source']

const PORTA_PADRAO: Record<string, string> = { 'http:': '80', 'https:': '443' }

export function canonicalizarUrl(entrada: string): string {
  const url = new URL(entrada.trim())

  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  url.username = ''
  url.password = ''

  if (url.port === PORTA_PADRAO[url.protocol]) url.port = ''

  for (const chave of [...url.searchParams.keys()]) {
    const nome = chave.toLowerCase()
    if (nome.startsWith('utm_') || PARAMETROS_DE_RASTREIO.includes(nome)) {
      url.searchParams.delete(chave)
    }
  }

  // Ordena o que sobrou: `?a=1&b=2` e `?b=2&a=1` são a mesma página.
  url.searchParams.sort()

  // `/vagas/123/` e `/vagas/123` também. A raiz continua sendo `/`.
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '')
  }

  return url.toString()
}

export function hashDaUrl(url: string): string {
  return createHash('sha256').update(canonicalizarUrl(url)).digest('hex')
}
