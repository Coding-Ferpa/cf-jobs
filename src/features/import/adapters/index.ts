import { ashby } from './ashby'
import { greenhouse } from './greenhouse'
import { gupy } from './gupy'
import { lever } from './lever'
import type { Adapter } from './types'

/**
 * Registro de adapters (doc 05, etapa 2). A ordem não importa: cada `detecta`
 * confere host e caminho, e eles não se sobrepõem.
 *
 * Sem adapter, a URL cai na cascata genérica — que é o comportamento certo
 * para o site de carreiras próprio de uma empresa, o caso mais comum fora dos
 * ATSs grandes.
 */
export const ADAPTERS: Adapter[] = [greenhouse, lever, ashby, gupy]

export function acharAdapter(url: URL): Adapter | null {
  return ADAPTERS.find((adapter) => adapter.detecta(url)) ?? null
}

export { ashby, greenhouse, gupy, lever }
export { FalhaDoAdapter, type Adapter } from './types'
