import { describe, expect, it } from 'vitest'

import { avaliarOrcamento, custoEstimadoUsd, percentil } from './budget'

/**
 * O bloqueio suave decide se alguém consegue importar; as faixas precisam
 * estar certas, inclusive a de baixo — inventar um teto onde o mantenedor não
 * definiu nenhum atrapalharia quem só quer usar o tier gratuito.
 */

describe('avaliarOrcamento', () => {
  it('sem teto definido não bloqueia nem calcula fração', () => {
    const orcamento = avaliarOrcamento({
      tokensIn: 900_000,
      tokensOut: 90_000,
      teto: null,
    })

    expect(orcamento).toMatchObject({
      situacao: 'sem_teto',
      fracao: null,
      exigeConfirmacao: false,
      tokensDoMes: 990_000,
    })
  })

  it('teto zero conta como ausente — não é "estourado desde o primeiro token"', () => {
    expect(avaliarOrcamento({ tokensIn: 1, tokensOut: 0, teto: 0 }).situacao).toBe(
      'sem_teto',
    )
  })

  it('abaixo de 80% do teto está tranquilo', () => {
    const orcamento = avaliarOrcamento({ tokensIn: 70, tokensOut: 0, teto: 100 })

    expect(orcamento.situacao).toBe('tranquilo')
    expect(orcamento.exigeConfirmacao).toBe(false)
  })

  it('em 80% o painel já avisa, mas ainda não bloqueia', () => {
    const orcamento = avaliarOrcamento({ tokensIn: 80, tokensOut: 0, teto: 100 })

    expect(orcamento.situacao).toBe('atencao')
    expect(orcamento.exigeConfirmacao).toBe(false)
  })

  it('no teto exato já é estouro e exige confirmação', () => {
    const orcamento = avaliarOrcamento({ tokensIn: 60, tokensOut: 40, teto: 100 })

    expect(orcamento.situacao).toBe('estourado')
    expect(orcamento.exigeConfirmacao).toBe(true)
    expect(orcamento.fracao).toBe(1)
  })

  it('soma entrada e saída — o teto do doc 05 é sobre os dois', () => {
    expect(avaliarOrcamento({ tokensIn: 30, tokensOut: 30, teto: 100 }).tokensDoMes).toBe(
      60,
    )
  })
})

describe('custoEstimadoUsd', () => {
  it('usa os preços de referência do doc 05', () => {
    // 1M de entrada + 1M de saída = 0,20 + 0,60.
    expect(custoEstimadoUsd(1_000_000, 1_000_000)).toBeCloseTo(0.8, 6)
  })

  it('uma importação típica custa fração de centavo', () => {
    expect(custoEstimadoUsd(6_000, 1_200)).toBeCloseTo(0.00192, 6)
  })
})

describe('percentil', () => {
  it('devolve null sem amostra', () => {
    expect(percentil([], 0.95)).toBeNull()
  })

  it('com um único valor, ele é o P95', () => {
    expect(percentil([4200], 0.95)).toBe(4200)
  })

  it('pega o maior quando a amostra é pequena', () => {
    expect(percentil([100, 200, 300], 0.95)).toBe(300)
  })

  it('em vinte valores, o P95 é o penúltimo maior', () => {
    const valores = Array.from({ length: 20 }, (_, i) => (i + 1) * 100)

    expect(percentil(valores, 0.95)).toBe(1900)
    expect(percentil(valores, 0.5)).toBe(1000)
  })

  it('ignora valores que não são número finito', () => {
    expect(percentil([100, Number.NaN, 300], 0.95)).toBe(300)
  })
})
