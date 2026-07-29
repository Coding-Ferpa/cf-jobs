import { describe, expect, it } from 'vitest'

import { atualizarVagaSchema, transicaoDeVagaSchema, vagaSchema } from './job'

/**
 * O schema é a mesma regra no formulário e na Server Action (doc 08): o que
 * passa aqui é exatamente o que chega ao banco. As transformações — dinheiro
 * digitado como se fala, textarea virando lista — são a parte que erra calada.
 */

const MINIMO = {
  title: 'Pessoa Desenvolvedora Backend',
  companyId: '11111111-1111-4111-8111-111111111111',
  descriptionMd:
    'Descrição longa o bastante para passar da validação mínima de cinquenta caracteres.',
  sourceUrl: 'https://exemplo.test/vaga',
  applyUrl: 'https://exemplo.test/vaga/candidatar',
}

const analisar = (extra: Record<string, unknown> = {}) =>
  vagaSchema.safeParse({ ...MINIMO, ...extra })

describe('vagaSchema', () => {
  it('aceita o mínimo e aplica os padrões', () => {
    const resultado = analisar()

    expect(resultado.success).toBe(true)
    if (!resultado.success) return

    expect(resultado.data.salaryPeriod).toBe('month')
    expect(resultado.data.language).toBe('pt-BR')
    expect(resultado.data.technologyIds).toEqual([])
    expect(resultado.data.benefits).toEqual([])
  })

  it('recusa título curto, descrição curta e URL inválida', () => {
    expect(analisar({ title: 'ab' }).success).toBe(false)
    expect(analisar({ descriptionMd: 'curta demais' }).success).toBe(false)
    expect(analisar({ sourceUrl: 'não é url' }).success).toBe(false)
    expect(analisar({ companyId: 'não é uuid' }).success).toBe(false)
  })

  describe('campos opcionais', () => {
    it('transforma texto vazio em null, para o banco receber null e não ""', () => {
      const resultado = analisar({ summary: '   ', locationCity: '' })

      expect(resultado.success).toBe(true)
      if (!resultado.success) return

      expect(resultado.data.summary).toBeNull()
      expect(resultado.data.locationCity).toBeNull()
    })

    it('aceita taxonomia vazia como "não informado"', () => {
      const resultado = analisar({ seniorityId: '', workModeId: null })

      expect(resultado.success).toBe(true)
      if (!resultado.success) return

      expect(resultado.data.seniorityId).toBeNull()
      expect(resultado.data.workModeId).toBeNull()
    })

    it('recusa taxonomia preenchida com algo que não é uuid', () => {
      expect(analisar({ seniorityId: 'pleno' }).success).toBe(false)
    })
  })

  describe('país', () => {
    it('normaliza para maiúsculas', () => {
      const resultado = analisar({ locationCountry: 'br' })

      expect(resultado.success).toBe(true)
      if (!resultado.success) return
      expect(resultado.data.locationCountry).toBe('BR')
    })

    it('exige a sigla de dois caracteres', () => {
      expect(analisar({ locationCountry: 'Brasil' }).success).toBe(false)
    })
  })

  describe('salário', () => {
    it('entende o número como se digita em pt-BR', () => {
      const resultado = analisar({
        salaryMin: '12.000,50',
        salaryMax: 18000,
        salaryCurrency: 'BRL',
      })

      expect(resultado.success).toBe(true)
      if (!resultado.success) return

      expect(resultado.data.salaryMin).toBe('12000.50')
      expect(resultado.data.salaryMax).toBe('18000')
    })

    it('vazio vira null sem exigir moeda', () => {
      const resultado = analisar({ salaryMin: '', salaryMax: '' })

      expect(resultado.success).toBe(true)
      if (!resultado.success) return
      expect(resultado.data.salaryMin).toBeNull()
    })

    it('recusa piso maior que o teto', () => {
      const resultado = analisar({
        salaryMin: '20000',
        salaryMax: '10000',
        salaryCurrency: 'BRL',
      })

      expect(resultado.success).toBe(false)
      if (resultado.success) return
      expect(resultado.error.issues.some((i) => i.path[0] === 'salaryMin')).toBe(true)
    })

    it('exige moeda quando há faixa', () => {
      const resultado = analisar({ salaryMin: '12000', salaryCurrency: null })

      expect(resultado.success).toBe(false)
      if (resultado.success) return
      expect(resultado.error.issues.some((i) => i.path[0] === 'salaryCurrency')).toBe(
        true,
      )
    })

    it('recusa valor que não é número', () => {
      expect(analisar({ salaryMin: 'a combinar', salaryCurrency: 'BRL' }).success).toBe(
        false,
      )
    })
  })

  describe('listas por linha', () => {
    it('quebra em linhas, tirando espaços e linhas vazias', () => {
      const resultado = analisar({
        benefits: 'Vale-refeição\n  Plano de saúde  \n\n\nHome office',
      })

      expect(resultado.success).toBe(true)
      if (!resultado.success) return

      expect(resultado.data.benefits).toEqual([
        'Vale-refeição',
        'Plano de saúde',
        'Home office',
      ])
    })
  })
})

describe('atualizarVagaSchema', () => {
  it('exige o id além dos campos da vaga', () => {
    expect(atualizarVagaSchema.safeParse(MINIMO).success).toBe(false)
    expect(
      atualizarVagaSchema.safeParse({
        ...MINIMO,
        id: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(true)
  })
})

describe('transicaoDeVagaSchema', () => {
  const id = '33333333-3333-4333-8333-333333333333'

  it('aceita sem data de expiração', () => {
    const resultado = transicaoDeVagaSchema.safeParse({ id })

    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    expect(resultado.data.expiresAt).toBeNull()
  })

  it('exige data ISO com fuso quando informada', () => {
    expect(
      transicaoDeVagaSchema.safeParse({ id, expiresAt: '2026-08-30T12:00:00Z' }).success,
    ).toBe(true)
    expect(transicaoDeVagaSchema.safeParse({ id, expiresAt: '30/08/2026' }).success).toBe(
      false,
    )
  })
})
