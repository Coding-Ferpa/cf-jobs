import { describe, expect, it } from 'vitest'

import {
  desativarTaxonomiaSchema,
  empresaSchema,
  papelSchema,
  taxonomiaSchema,
} from './admin'

/** Mesmos schemas do formulário e da action (doc 08). */

const ID = '11111111-1111-4111-8111-111111111111'

describe('empresaSchema', () => {
  it('aceita só o nome', () => {
    const resultado = empresaSchema.safeParse({ name: 'Aurora Pagamentos' })

    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    expect(resultado.data.website).toBeNull()
  })

  it('recusa nome curto', () => {
    expect(empresaSchema.safeParse({ name: 'A' }).success).toBe(false)
  })

  it('transforma URL vazia em null e valida a preenchida', () => {
    const vazia = empresaSchema.safeParse({ name: 'Aurora', website: '  ' })
    expect(vazia.success).toBe(true)
    if (vazia.success) expect(vazia.data.website).toBeNull()

    expect(
      empresaSchema.safeParse({ name: 'Aurora', website: 'aurora.test' }).success,
    ).toBe(false)
    expect(
      empresaSchema.safeParse({ name: 'Aurora', website: 'https://aurora.test' }).success,
    ).toBe(true)
  })
})

describe('taxonomiaSchema', () => {
  const base = { kind: 'technology' as const, label: 'Elixir' }

  it('aplica os padrões de ordem e específicos', () => {
    const resultado = taxonomiaSchema.safeParse(base)

    expect(resultado.success).toBe(true)
    if (!resultado.success) return

    expect(resultado.data.sortOrder).toBe(0)
    expect(resultado.data.aliases).toEqual([])
    expect(resultado.data.technologyKind).toBeNull()
  })

  it('quebra os sinônimos por linha e normaliza para minúsculas', () => {
    // O mapeamento da importação compara em minúsculas (doc 05).
    const resultado = taxonomiaSchema.safeParse({
      ...base,
      aliases: 'ElixirLang\n  BEAM  \n\nOTP',
    })

    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    expect(resultado.data.aliases).toEqual(['elixirlang', 'beam', 'otp'])
  })

  it('aceita número vindo do formulário como texto', () => {
    const resultado = taxonomiaSchema.safeParse({
      ...base,
      kind: 'seniority',
      rank: '5',
      sortOrder: '3',
    })

    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    expect(resultado.data.rank).toBe(5)
    expect(resultado.data.sortOrder).toBe(3)
  })

  it('recusa tipo de taxonomia e tipo de tecnologia desconhecidos', () => {
    expect(taxonomiaSchema.safeParse({ ...base, kind: 'inventado' }).success).toBe(false)
    expect(
      taxonomiaSchema.safeParse({ ...base, technologyKind: 'runtime' }).success,
    ).toBe(false)
  })

  it('recusa rótulo curto e ordem fora da faixa', () => {
    expect(taxonomiaSchema.safeParse({ ...base, label: 'E' }).success).toBe(false)
    expect(taxonomiaSchema.safeParse({ ...base, sortOrder: 99999 }).success).toBe(false)
  })
})

describe('desativarTaxonomiaSchema', () => {
  it('exige tipo, id e o estado desejado', () => {
    expect(
      desativarTaxonomiaSchema.safeParse({ kind: 'tag', id: ID, isActive: false })
        .success,
    ).toBe(true)
    expect(desativarTaxonomiaSchema.safeParse({ kind: 'tag', id: ID }).success).toBe(
      false,
    )
  })
})

describe('papelSchema', () => {
  it('aceita só os papéis que existem', () => {
    expect(papelSchema.safeParse({ userId: ID, role: 'editor' }).success).toBe(true)
    expect(papelSchema.safeParse({ userId: ID, role: 'superadmin' }).success).toBe(false)
  })
})
