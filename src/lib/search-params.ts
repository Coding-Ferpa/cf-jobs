import {
  createLoader,
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server'

/**
 * O estado dos filtros mora na URL (doc 01): link compartilhável, botão voltar
 * funcionando e página filtrada indexável, sem store global.
 *
 * Este módulo é a fonte única dos parâmetros — o Server Component lê com
 * `loadFiltros` e os componentes de filtro escrevem com os mesmos parsers.
 */

export const STATUS_DE_BUSCA = ['published', 'archived', 'all'] as const
export const ORDENACOES = ['recent', 'relevance'] as const

export const filtrosDeVagas = {
  q: parseAsString.withDefault(''),
  tech: parseAsArrayOf(parseAsString).withDefault([]),
  role: parseAsArrayOf(parseAsString).withDefault([]),
  seniority: parseAsArrayOf(parseAsString).withDefault([]),
  work_mode: parseAsArrayOf(parseAsString).withDefault([]),
  contract_type: parseAsArrayOf(parseAsString).withDefault([]),
  tag: parseAsArrayOf(parseAsString).withDefault([]),
  company: parseAsArrayOf(parseAsString).withDefault([]),
  status: parseAsStringLiteral(STATUS_DE_BUSCA).withDefault('published'),
  sort: parseAsStringLiteral(ORDENACOES).withDefault('recent'),
  cursor: parseAsString,
}

export const loadFiltros = createLoader(filtrosDeVagas)

export type FiltrosDeVagas = Awaited<ReturnType<typeof loadFiltros>>

/** Quantos filtros de fato estreitam a busca — usado no rótulo do botão mobile. */
export function contarFiltrosAtivos(filtros: FiltrosDeVagas): number {
  const listas = [
    filtros.tech,
    filtros.role,
    filtros.seniority,
    filtros.work_mode,
    filtros.contract_type,
    filtros.tag,
    filtros.company,
  ]

  const daLista = listas.reduce((total, lista) => total + lista.length, 0)
  const deStatus = filtros.status === 'published' ? 0 : 1

  return daLista + deStatus
}
