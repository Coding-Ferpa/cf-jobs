/**
 * Orçamento de tokens e custo estimado (doc 05, "custo e orçamento").
 *
 * O tier contratado é gratuito, então o painel existe por **observabilidade**:
 * saber quanto se consome é o que permite decidir se um dia vale pagar. O
 * bloqueio suave só entra quando `AI_MONTHLY_TOKEN_BUDGET` é definida —
 * inventar um teto que ninguém pediu só atrapalharia quem importa.
 *
 * Módulo puro: as contas ficam longe do SQL e do React, e por isso dá para
 * testar cada faixa sem banco.
 */

/** Preços de referência do build.nvidia.com (doc 05), em dólar por milhão. */
export const PRECO_POR_MILHAO_ENTRADA = 0.2
export const PRECO_POR_MILHAO_SAIDA = 0.6

/** A partir daqui o painel avisa; o doc 09 pede o badge vermelho em 80%. */
export const ALERTA_DE_ORCAMENTO = 0.8

export type SituacaoDoOrcamento = 'sem_teto' | 'tranquilo' | 'atencao' | 'estourado'

export type Orcamento = {
  tokensDoMes: number
  /** `null` quando `AI_MONTHLY_TOKEN_BUDGET` não está definida. */
  teto: number | null
  /** 0 a 1; `null` sem teto — não há do que ser uma fração. */
  fracao: number | null
  situacao: SituacaoDoOrcamento
  /** Só o estouro exige confirmação; abaixo dele o aviso basta (doc 05). */
  exigeConfirmacao: boolean
  custoEstimadoUsd: number
}

export function custoEstimadoUsd(tokensIn: number, tokensOut: number): number {
  return (
    (tokensIn / 1_000_000) * PRECO_POR_MILHAO_ENTRADA +
    (tokensOut / 1_000_000) * PRECO_POR_MILHAO_SAIDA
  )
}

export function avaliarOrcamento(entrada: {
  tokensIn: number
  tokensOut: number
  teto: number | null
}): Orcamento {
  const tokensDoMes = entrada.tokensIn + entrada.tokensOut
  const custo = custoEstimadoUsd(entrada.tokensIn, entrada.tokensOut)

  if (entrada.teto === null || entrada.teto <= 0) {
    return {
      tokensDoMes,
      teto: null,
      fracao: null,
      situacao: 'sem_teto',
      exigeConfirmacao: false,
      custoEstimadoUsd: custo,
    }
  }

  const fracao = tokensDoMes / entrada.teto
  const situacao: SituacaoDoOrcamento =
    fracao >= 1 ? 'estourado' : fracao >= ALERTA_DE_ORCAMENTO ? 'atencao' : 'tranquilo'

  return {
    tokensDoMes,
    teto: entrada.teto,
    fracao,
    situacao,
    exigeConfirmacao: situacao === 'estourado',
    custoEstimadoUsd: custo,
  }
}

/**
 * P95 sobre uma amostra pequena. A definição é a do "nearest rank": ordena e
 * pega o elemento na posição ⌈0,95·n⌉. Com poucas importações por mês, um
 * método interpolado daria falsa precisão.
 */
export function percentil(valores: number[], fracao: number): number | null {
  const ordenados = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (ordenados.length === 0) return null

  const posicao = Math.ceil(fracao * ordenados.length)
  return ordenados[Math.min(Math.max(posicao, 1), ordenados.length) - 1] ?? null
}
