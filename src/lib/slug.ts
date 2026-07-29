/**
 * Slug de vaga: `{titulo}-{empresa}-{6 chars do id}` (doc 02).
 *
 * O sufixo do id garante unicidade sem depender do título, que muda; por isso a
 * URL sobrevive a uma renomeação (com redirect 301 quando o slug mudar).
 */

const SEPARADOR = '-'
const TAMANHO_MAXIMO_TITULO = 60
const TAMANHO_MAXIMO_EMPRESA = 30
const TAMANHO_SUFIXO = 6

/** Remove acentos, pontuação e espaços — o que sobra vai para a URL. */
export function kebab(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, SEPARADOR)
    .replace(/^-+|-+$/g, '')
}

function limitar(value: string, tamanho: number): string {
  if (value.length <= tamanho) return value
  // Corta na fronteira de palavra para não deixar pedaço solto na URL.
  const cortado = value.slice(0, tamanho)
  const ultimoSeparador = cortado.lastIndexOf(SEPARADOR)
  return ultimoSeparador > 0 ? cortado.slice(0, ultimoSeparador) : cortado
}

/** Últimos 6 caracteres alfanuméricos do UUID — legível e sem colisão prática. */
export function sufixoDoId(id: string): string {
  const alfanumerico = id.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return alfanumerico.slice(-TAMANHO_SUFIXO)
}

export function jobSlug(title: string, companyName: string, id: string): string {
  const partes = [
    limitar(kebab(title), TAMANHO_MAXIMO_TITULO),
    limitar(kebab(companyName), TAMANHO_MAXIMO_EMPRESA),
    sufixoDoId(id),
  ].filter((parte) => parte.length > 0)

  return partes.join(SEPARADOR)
}
