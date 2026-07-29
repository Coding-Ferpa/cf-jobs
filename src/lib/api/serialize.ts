import type { JobDetail, JobListItem } from '@/db/queries/jobs'

/**
 * Tradução do modelo interno para o corpo público da API v1 (doc 06).
 *
 * A API fala `snake_case` e o código fala `camelCase`; este módulo é a única
 * fronteira onde os dois se encontram — renomear campo interno não pode
 * quebrar contrato de terceiro sem passar por aqui.
 *
 * Taxonomias saem como slug: é o mesmo valor que se usa para filtrar, então
 * quem lê uma vaga já sabe como pedir as parecidas. O rótulo humano vem de
 * `/api/v1/taxonomies`, uma vez, em vez de repetido em cada vaga.
 */

export type TecnologiaPublica = {
  slug: string
  label: string
  is_primary: boolean
}

export type VagaPublica = {
  slug: string
  title: string
  company: { name: string; slug: string; logo_url: string | null }
  summary: string | null
  role_category: string | null
  seniority: string | null
  work_mode: string | null
  contract_type: string | null
  location: { city: string | null; state: string | null; country: string | null }
  salary: {
    min: number | null
    max: number | null
    currency: string | null
    period: string
  }
  technologies: TecnologiaPublica[]
  tags: string[]
  status: 'published' | 'archived'
  published_at: string | null
  expires_at: string | null
  url: string
}

export type VagaPublicaDetalhe = VagaPublica & {
  description_md: string
  benefits: string[]
  keywords: string[]
  language: string
  apply_url: string
  source_url: string
  source_site: string | null
  views_count: number
  clicks_count: number
  updated_at: string
  archived_at: string | null
}

/**
 * `numeric` chega do driver como texto para não perder precisão. Salário cabe
 * com folga em número JS, e um JSON com `"12000.00"` entre aspas obrigaria
 * cada consumidor a converter — a conversão acontece uma vez, aqui.
 */
function numero(valor: string | null): number | null {
  if (valor === null) return null
  const convertido = Number(valor)
  return Number.isFinite(convertido) ? convertido : null
}

export function urlDaVaga(slug: string, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/vagas/${slug}`
}

export function vagaDeLista(vaga: JobListItem, siteUrl: string): VagaPublica {
  return {
    slug: vaga.slug,
    title: vaga.title,
    company: {
      name: vaga.company.name,
      slug: vaga.company.slug,
      logo_url: vaga.company.logoUrl,
    },
    summary: vaga.summary,
    role_category: vaga.roleCategory?.slug ?? null,
    seniority: vaga.seniority?.slug ?? null,
    work_mode: vaga.workMode?.slug ?? null,
    contract_type: vaga.contractType?.slug ?? null,
    location: vaga.location,
    salary: {
      min: numero(vaga.salary.min),
      max: numero(vaga.salary.max),
      currency: vaga.salary.currency,
      period: vaga.salary.period,
    },
    technologies: vaga.technologies.map((tecnologia) => ({
      slug: tecnologia.slug,
      label: tecnologia.label,
      is_primary: tecnologia.isPrimary,
    })),
    tags: vaga.tags.map((tag) => tag.slug),
    status: vaga.status,
    published_at: vaga.publishedAt,
    expires_at: vaga.expiresAt,
    url: urlDaVaga(vaga.slug, siteUrl),
  }
}

export function vagaDetalhada(vaga: JobDetail, siteUrl: string): VagaPublicaDetalhe {
  return {
    ...vagaDeLista(vaga, siteUrl),
    description_md: vaga.descriptionMd,
    benefits: vaga.benefits,
    keywords: vaga.keywords,
    language: vaga.language,
    apply_url: vaga.applyUrl,
    source_url: vaga.sourceUrl,
    source_site: vaga.sourceSite,
    views_count: vaga.viewsCount,
    clicks_count: vaga.clicksCount,
    updated_at: vaga.updatedAt,
    archived_at: vaga.archivedAt,
  }
}
