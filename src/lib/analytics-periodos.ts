/**
 * Os períodos que o painel de analytics oferece (doc 09).
 *
 * Ficam em `lib/` e não junto das queries porque o seletor é um componente, e
 * componente não importa de `db/queries` (doc 02) — nem para pegar uma lista de
 * três números.
 */

export const PERIODOS = [7, 30, 90] as const

export type Periodo = (typeof PERIODOS)[number]

/** Query string é entrada externa: `?periodo=abc` cai no padrão, não em erro. */
export function periodoValido(valor: unknown): Periodo {
  const numero = Number(valor)
  return (PERIODOS as readonly number[]).includes(numero) ? (numero as Periodo) : 30
}
