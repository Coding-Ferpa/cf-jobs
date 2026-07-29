import { describe, expect, it } from 'vitest'

import { jobSlug, kebab, sufixoDoId } from '@/lib/slug'

const UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const SUFIXO = '3b4c5d'

describe('kebab', () => {
  it('remove acentuação do português', () => {
    expect(kebab('Pessoa Desenvolvedora Sênior')).toBe('pessoa-desenvolvedora-senior')
    expect(kebab('Análise & Projeção')).toBe('analise-projecao')
  })

  it('colapsa pontuação e espaços em um único hífen', () => {
    expect(kebab('Dev  Back-End   (Node.js)')).toBe('dev-back-end-node-js')
  })

  it('não deixa hífen sobrando nas pontas', () => {
    expect(kebab('  --React--  ')).toBe('react')
    expect(kebab('C++')).toBe('c')
  })
})

describe('sufixoDoId', () => {
  it('usa os últimos seis caracteres alfanuméricos do uuid', () => {
    expect(sufixoDoId(UUID)).toBe(SUFIXO)
  })
})

describe('jobSlug', () => {
  it('junta título, empresa e sufixo', () => {
    expect(jobSlug('Pessoa Desenvolvedora Backend', 'Nubank', UUID)).toBe(
      `pessoa-desenvolvedora-backend-nubank-${SUFIXO}`,
    )
  })

  it('encurta título longo na fronteira de palavra', () => {
    const slug = jobSlug(
      'Pessoa Desenvolvedora Backend Sênior Especialista em Sistemas Distribuídos e Alta Disponibilidade',
      'Empresa de Tecnologia Muito Grande do Brasil',
      UUID,
    )

    expect(slug).toBe(
      `pessoa-desenvolvedora-backend-senior-especialista-em-empresa-de-tecnologia-muito-${SUFIXO}`,
    )
    // Nenhum pedaço cortado no meio da palavra e nenhum hífen duplicado.
    expect(slug).not.toContain('--')
    expect(slug).not.toContain('-sistem-')
  })

  it('sobrevive a título sem caractere aproveitável', () => {
    expect(jobSlug('***', 'Nubank', UUID)).toBe(`nubank-${SUFIXO}`)
  })
})
