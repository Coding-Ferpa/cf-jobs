import { describe, expect, it } from 'vitest'

import { contarFiltrosAtivos, type FiltrosDeVagas } from './search-params'

/**
 * A contagem virou o badge do botão "Filtros" (doc 03): é o único sinal de que
 * há filtro aplicado enquanto o painel está fechado.
 */

const VAZIO: FiltrosDeVagas = {
  q: '',
  tech: [],
  role: [],
  seniority: [],
  work_mode: [],
  contract_type: [],
  tag: [],
  company: [],
  status: 'published',
  sort: 'recent',
  cursor: null,
}

describe('contarFiltrosAtivos', () => {
  it('não conta nada quando nada estreita a busca', () => {
    expect(contarFiltrosAtivos(VAZIO)).toBe(0)
  })

  it('soma cada valor selecionado, e não cada grupo', () => {
    expect(
      contarFiltrosAtivos({
        ...VAZIO,
        tech: ['react', 'typescript'],
        role: ['frontend'],
      }),
    ).toBe(3)
  })

  it('conta situação diferente da padrão como um filtro', () => {
    expect(contarFiltrosAtivos({ ...VAZIO, status: 'archived' })).toBe(1)
    expect(contarFiltrosAtivos({ ...VAZIO, status: 'all' })).toBe(1)
  })

  // A busca tem chip próprio e campo visível: contá-la no badge do funil
  // faria o número não bater com o que o painel mostra selecionado.
  it('ignora o texto da busca, a ordenação e o cursor', () => {
    expect(
      contarFiltrosAtivos({ ...VAZIO, q: 'react', sort: 'relevance', cursor: 'abc' }),
    ).toBe(0)
  })
})
