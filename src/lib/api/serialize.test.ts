import { describe, expect, it } from 'vitest'

import type { JobDetail, JobListItem } from '@/db/queries/jobs'

import { urlDaVaga, vagaDeLista, vagaDetalhada } from './serialize'

const SITE = 'https://vagas.codingferpa.org'

function vaga(parcial: Partial<JobListItem> = {}): JobListItem {
  return {
    slug: 'pessoa-dev-backend-nubank-a1b2c3',
    title: 'Pessoa Desenvolvedora Backend',
    summary: 'Time de pagamentos.',
    company: { name: 'Nubank', slug: 'nubank', logoUrl: null },
    roleCategory: { slug: 'backend', label: 'Backend' },
    seniority: { slug: 'senior', label: 'Sênior' },
    workMode: { slug: 'hybrid', label: 'Híbrido' },
    contractType: { slug: 'clt', label: 'CLT' },
    location: { city: 'São Paulo', state: 'SP', country: 'BR' },
    salary: { min: '12000.00', max: '18000.00', currency: 'BRL', period: 'month' },
    technologies: [{ slug: 'clojure', label: 'Clojure', isPrimary: true }],
    tags: [{ slug: 'fintech', label: 'Fintech' }],
    status: 'published',
    publishedAt: '2026-07-20T12:00:00.000Z',
    expiresAt: '2026-08-19T12:00:00.000Z',
    ...parcial,
  }
}

function detalhe(parcial: Partial<JobDetail> = {}): JobDetail {
  return {
    ...vaga(),
    descriptionMd: '# Sobre a vaga',
    benefits: ['Plano de saúde'],
    keywords: ['clojure'],
    language: 'pt-BR',
    applyUrl: 'https://nubank.exemplo/vagas/1',
    sourceUrl: 'https://nubank.exemplo/vagas/1',
    sourceSite: 'nubank.exemplo',
    viewsCount: 42,
    clicksCount: 7,
    updatedAt: '2026-07-21T12:00:00.000Z',
    archivedAt: null,
    ...parcial,
  }
}

describe('vagaDeLista', () => {
  it('entrega o corpo do doc 06 em snake_case', () => {
    expect(vagaDeLista(vaga(), SITE)).toEqual({
      slug: 'pessoa-dev-backend-nubank-a1b2c3',
      title: 'Pessoa Desenvolvedora Backend',
      company: { name: 'Nubank', slug: 'nubank', logo_url: null },
      summary: 'Time de pagamentos.',
      role_category: 'backend',
      seniority: 'senior',
      work_mode: 'hybrid',
      contract_type: 'clt',
      location: { city: 'São Paulo', state: 'SP', country: 'BR' },
      salary: { min: 12000, max: 18000, currency: 'BRL', period: 'month' },
      technologies: [{ slug: 'clojure', label: 'Clojure', is_primary: true }],
      tags: ['fintech'],
      status: 'published',
      published_at: '2026-07-20T12:00:00.000Z',
      expires_at: '2026-08-19T12:00:00.000Z',
      url: `${SITE}/vagas/pessoa-dev-backend-nubank-a1b2c3`,
    })
  })

  it('converte salário de texto para número', () => {
    const salario = vagaDeLista(vaga(), SITE).salary

    expect(salario.min).toBe(12000)
    expect(typeof salario.min).toBe('number')
  })

  it('mantém salário ausente como null em vez de zero', () => {
    const semSalario = vaga({
      salary: { min: null, max: null, currency: null, period: 'month' },
    })

    expect(vagaDeLista(semSalario, SITE).salary).toEqual({
      min: null,
      max: null,
      currency: null,
      period: 'month',
    })
  })

  it('devolve null nas taxonomias que a vaga não tem', () => {
    const semTaxonomia = vaga({
      roleCategory: null,
      seniority: null,
      workMode: null,
      contractType: null,
    })
    const serializada = vagaDeLista(semTaxonomia, SITE)

    expect(serializada.role_category).toBeNull()
    expect(serializada.work_mode).toBeNull()
  })

  it('não vaza nome de campo interno', () => {
    const chaves = Object.keys(vagaDeLista(vaga(), SITE))

    expect(chaves).not.toContain('workMode')
    expect(chaves).not.toContain('publishedAt')
  })
})

describe('vagaDetalhada', () => {
  it('acrescenta o conteúdo e os contadores ao corpo de lista', () => {
    const serializada = vagaDetalhada(detalhe(), SITE)

    expect(serializada).toMatchObject({
      description_md: '# Sobre a vaga',
      benefits: ['Plano de saúde'],
      keywords: ['clojure'],
      language: 'pt-BR',
      apply_url: 'https://nubank.exemplo/vagas/1',
      source_url: 'https://nubank.exemplo/vagas/1',
      views_count: 42,
      clicks_count: 7,
      archived_at: null,
    })
    // O corpo de lista continua inteiro dentro do detalhe.
    expect(serializada.slug).toBe('pessoa-dev-backend-nubank-a1b2c3')
  })

  it('marca vaga arquivada como arquivada, sem escondê-la', () => {
    const arquivada = vagaDetalhada(
      detalhe({ status: 'archived', archivedAt: '2026-08-20T00:00:00.000Z' }),
      SITE,
    )

    expect(arquivada.status).toBe('archived')
    expect(arquivada.archived_at).toBe('2026-08-20T00:00:00.000Z')
  })
})

describe('urlDaVaga', () => {
  it('não duplica a barra quando o site vem com barra final', () => {
    expect(urlDaVaga('x', 'https://exemplo.test/')).toBe('https://exemplo.test/vagas/x')
  })
})
