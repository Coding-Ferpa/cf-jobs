import { describe, expect, it } from 'vitest'

import type { JobDetail } from '@/db/queries/jobs'
import { breadcrumbJsonLd, jobPostingJsonLd, tituloDaVaga } from '@/lib/seo'

const BASE = 'https://vagas.codingferpa.org'
const URL_DA_VAGA = `${BASE}/vagas/sre-aurora-f6a7b8`

const VAGA: JobDetail = {
  slug: 'sre-aurora-f6a7b8',
  title: 'Site Reliability Engineering',
  summary: 'Confiabilidade de plataforma financeira.',
  company: { name: 'Aurora Pagamentos', slug: 'aurora-pagamentos', logoUrl: null },
  roleCategory: { slug: 'sre', label: 'SRE' },
  seniority: { slug: 'especialista', label: 'Especialista' },
  workMode: { slug: 'remoto', label: 'Remoto' },
  contractType: { slug: 'clt', label: 'CLT' },
  location: { city: null, state: null, country: 'BR' },
  salary: { min: '18000.00', max: '26000.00', currency: 'BRL', period: 'month' },
  technologies: [],
  tags: [],
  status: 'published',
  publishedAt: '2026-07-20T12:00:00.000Z',
  expiresAt: '2026-08-19T12:00:00.000Z',
  descriptionMd: '## Sobre a vaga',
  benefits: [],
  keywords: [],
  language: 'pt-BR',
  applyUrl: 'https://aurora.exemplo.test/vagas/sre/candidatar',
  sourceUrl: 'https://aurora.exemplo.test/vagas/sre',
  sourceSite: 'generic',
  updatedAt: '2026-07-20T12:00:00.000Z',
  archivedAt: null,
}

describe('tituloDaVaga', () => {
  it('segue o formato do doc 08', () => {
    expect(tituloDaVaga(VAGA)).toBe(
      'Site Reliability Engineering — Aurora Pagamentos | Vagas Coding Ferpa',
    )
  })
})

describe('jobPostingJsonLd', () => {
  it('traz os campos exigidos pelo Google for Jobs', () => {
    const dados = jobPostingJsonLd(VAGA, URL_DA_VAGA)

    expect(dados['@type']).toBe('JobPosting')
    expect(dados.title).toBe(VAGA.title)
    expect(dados.datePosted).toBe(VAGA.publishedAt)
    expect(dados.validThrough).toBe(VAGA.expiresAt)
    expect(dados.hiringOrganization).toMatchObject({ name: 'Aurora Pagamentos' })
    expect(dados.directApply).toBe(false)
  })

  it('mapeia contratação brasileira para o vocabulário do schema.org', () => {
    expect(jobPostingJsonLd(VAGA, URL_DA_VAGA).employmentType).toBe('FULL_TIME')

    const estagio = {
      ...VAGA,
      contractType: { slug: 'estagio', label: 'Estágio' },
    }
    expect(jobPostingJsonLd(estagio, URL_DA_VAGA).employmentType).toBe('INTERN')

    const pj = { ...VAGA, contractType: { slug: 'pj', label: 'PJ' } }
    expect(jobPostingJsonLd(pj, URL_DA_VAGA).employmentType).toBe('CONTRACTOR')
  })

  it('marca vaga remota como teletrabalho com restrição de país', () => {
    const dados = jobPostingJsonLd(VAGA, URL_DA_VAGA)

    expect(dados.jobLocationType).toBe('TELECOMMUTE')
    expect(dados.applicantLocationRequirements).toMatchObject({ name: 'BR' })
  })

  it('descreve endereço quando a vaga é presencial', () => {
    const presencial: JobDetail = {
      ...VAGA,
      workMode: { slug: 'presencial', label: 'Presencial' },
      location: { city: 'Recife', state: 'PE', country: 'BR' },
    }

    const dados = jobPostingJsonLd(presencial, URL_DA_VAGA)

    expect(dados.jobLocationType).toBeUndefined()
    expect(dados.jobLocation).toMatchObject({
      address: { addressLocality: 'Recife', addressRegion: 'PE', addressCountry: 'BR' },
    })
  })

  it('inclui faixa salarial só quando existe', () => {
    expect(jobPostingJsonLd(VAGA, URL_DA_VAGA).baseSalary).toMatchObject({
      currency: 'BRL',
      value: { minValue: 18000, maxValue: 26000, unitText: 'MONTH' },
    })

    const semSalario: JobDetail = {
      ...VAGA,
      salary: { min: null, max: null, currency: null, period: 'month' },
    }
    expect(jobPostingJsonLd(semSalario, URL_DA_VAGA).baseSalary).toBeUndefined()
  })

  it('mantém validThrough no passado para vaga arquivada', () => {
    const arquivada: JobDetail = {
      ...VAGA,
      status: 'archived',
      expiresAt: '2026-06-01T12:00:00.000Z',
    }

    expect(jobPostingJsonLd(arquivada, URL_DA_VAGA).validThrough).toBe(
      '2026-06-01T12:00:00.000Z',
    )
  })
})

describe('breadcrumbJsonLd', () => {
  it('descreve a trilha com três níveis', () => {
    const dados = breadcrumbJsonLd(VAGA, URL_DA_VAGA, BASE)

    expect(dados.itemListElement).toHaveLength(3)
    expect(dados.itemListElement[2]).toMatchObject({
      position: 3,
      name: VAGA.title,
      item: URL_DA_VAGA,
    })
  })
})
