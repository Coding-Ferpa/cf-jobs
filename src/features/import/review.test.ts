import { describe, expect, it } from 'vitest'

import { conferirRevisao, lerRespostaDaIa } from './review'
import type { VagaClassificada } from './schema'

/**
 * A conferência da tela de revisão compara o que a IA respondeu com o que
 * virou vaga. É a única fonte do destaque de baixa confiança — por isso
 * precisa acertar quando **não** há nada a destacar tanto quanto quando há.
 */

const IA: VagaClassificada = {
  title: 'Pessoa Desenvolvedora Backend',
  company_name: 'Aurora',
  summary: 'Backend.',
  description_md: 'x'.repeat(120),
  work_mode: 'hybrid',
  contract_type: 'clt',
  seniority: 'senior',
  role_category: 'backend',
  technologies: ['go', 'postgresql'],
  tags: ['fintech'],
  unmatched_terms: [],
  location: { city: 'Recife', state: 'PE', country: 'BR' },
  salary: { min: 12000, max: 18000, currency: 'BRL', period: 'month' },
  benefits: [],
  keywords: [],
  language: 'pt-BR',
  posted_at: null,
  confidence: 0.9,
}

const VAGA = {
  roleCategoryId: 'r1',
  seniorityId: 's1',
  workModeId: 'w1',
  contractTypeId: 'c1',
  technologyIds: ['t1', 't2'],
  tagIds: ['g1'],
  salaryMin: '12000.00',
  locationCity: 'Recife',
  locationCountry: 'BR',
}

describe('conferirRevisao', () => {
  it('não inventa alerta quando tudo mapeou', () => {
    const conferencia = conferirRevisao({ ia: IA, vaga: VAGA })

    expect(conferencia.divergencias).toEqual([])
    expect(conferencia.confianca).toBe(0.9)
    expect(conferencia.baixaConfianca).toBe(false)
  })

  it('aponta o escalar que a IA leu e o cadastro não tem', () => {
    const conferencia = conferirRevisao({
      ia: IA,
      vaga: { ...VAGA, workModeId: null },
    })

    expect(conferencia.divergencias).toHaveLength(1)
    expect(conferencia.divergencias[0]).toMatchObject({
      campo: 'workModeId',
      situacao: 'nao_cadastrado',
      extraido: 'hybrid',
    })
  })

  it('distingue "não cadastrado" de "a vaga não dizia"', () => {
    const conferencia = conferirRevisao({
      ia: { ...IA, seniority: null },
      vaga: { ...VAGA, seniorityId: null },
    })

    expect(conferencia.divergencias[0]).toMatchObject({
      campo: 'seniorityId',
      situacao: 'ausente',
      extraido: null,
    })
  })

  it('aponta lista mapeada pela metade', () => {
    const conferencia = conferirRevisao({
      ia: IA,
      vaga: { ...VAGA, technologyIds: ['t1'] },
    })

    expect(conferencia.divergencias[0]).toMatchObject({
      campo: 'technologyIds',
      situacao: 'parcial',
    })
  })

  /** O mapeamento recupera termos do `unmatched_terms`: sobrar id é normal. */
  it('não reclama quando o cadastro tem mais do que a IA citou', () => {
    const conferencia = conferirRevisao({
      ia: IA,
      vaga: { ...VAGA, technologyIds: ['t1', 't2', 't3'] },
    })

    expect(conferencia.divergencias).toEqual([])
  })

  it('marca baixa confiança abaixo do mínimo do doc 05', () => {
    const conferencia = conferirRevisao({ ia: { ...IA, confidence: 0.4 }, vaga: VAGA })

    expect(conferencia.baixaConfianca).toBe(true)
  })

  it('avisa quando a vaga não trouxe local nenhum', () => {
    const conferencia = conferirRevisao({
      ia: { ...IA, location: {} },
      vaga: { ...VAGA, locationCity: null, locationCountry: null },
    })

    expect(conferencia.divergencias.some((d) => d.campo === 'locationCity')).toBe(true)
  })

  it('avisa quando o salário lido não foi gravado', () => {
    const conferencia = conferirRevisao({ ia: IA, vaga: { ...VAGA, salaryMin: null } })

    expect(conferencia.divergencias.some((d) => d.campo === 'salaryMin')).toBe(true)
  })

  it('sem resposta da IA não há o que conferir', () => {
    const conferencia = conferirRevisao({ ia: null, vaga: VAGA })

    expect(conferencia).toEqual({
      confianca: null,
      baixaConfianca: false,
      divergencias: [],
    })
  })
})

describe('lerRespostaDaIa', () => {
  it('valida o jsonb com o mesmo schema da classificação', () => {
    expect(lerRespostaDaIa(IA)?.title).toBe('Pessoa Desenvolvedora Backend')
  })

  it('devolve null para o que não é resposta de vaga', () => {
    expect(lerRespostaDaIa(null)).toBeNull()
    expect(lerRespostaDaIa('texto')).toBeNull()
    expect(lerRespostaDaIa({ title: 'só isso' })).toBeNull()
  })
})
