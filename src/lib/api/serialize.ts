import type { JobDetail, JobListItem } from '@/db/queries/jobs'

import type { VagaPublica, VagaPublicaDetalhe } from './schemas'

/**
 * Tradução do modelo interno para o corpo público da API v1 (doc 06).
 *
 * A API fala `snake_case` e o código fala `camelCase`; este módulo é a única
 * fronteira onde os dois se encontram — renomear campo interno não pode
 * quebrar contrato de terceiro sem passar por aqui.
 *
 * O formato de saída é o inferido dos schemas de `schemas.ts`, os mesmos que
 * geram o OpenAPI: se o corpo divergir do contrato publicado, não compila.
 */

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
