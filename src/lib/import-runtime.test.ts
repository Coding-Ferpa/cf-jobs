import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  MARGEM_DE_ENCERRAMENTO_MS,
  MAX_DURATION_DA_IMPORTACAO,
  ORCAMENTO_DA_IMPORTACAO_MS,
  PAGINAS_QUE_IMPORTAM,
} from '@/lib/import-runtime'

describe('orçamento da importação', () => {
  it('é o teto da rota menos a margem de encerramento', () => {
    expect(ORCAMENTO_DA_IMPORTACAO_MS).toBe(
      MAX_DURATION_DA_IMPORTACAO * 1_000 - MARGEM_DE_ENCERRAMENTO_MS,
    )
  })

  /**
   * O `maxDuration` de um segmento do Next precisa ser literal, então o número
   * vive em dois lugares. Divergir é silencioso e caro: a plataforma mataria a
   * função enquanto o pipeline ainda acha que tem tempo.
   */
  it('bate com o maxDuration declarado nas páginas que importam', () => {
    for (const pagina of PAGINAS_QUE_IMPORTAM) {
      const fonte = readFileSync(join(process.cwd(), pagina), 'utf8')

      expect(fonte, pagina).toContain(
        `export const maxDuration = ${MAX_DURATION_DA_IMPORTACAO}`,
      )
    }
  })
})
