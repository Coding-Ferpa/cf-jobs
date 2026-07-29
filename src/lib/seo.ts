import type { JobDetail } from '@/db/queries/jobs'

/**
 * Dados estruturados (doc 08). O JSON-LD de `JobPosting` é o que coloca a vaga
 * no Google for Jobs — daí a fidelidade ao vocabulário do schema.org, mesmo
 * quando o nome do campo não bate com o do nosso banco.
 *
 * Funções puras de propósito: montar o objeto é a parte que tem regra e merece
 * teste; renderizar é trivial.
 */

/** Contratação brasileira → vocabulário do schema.org. */
const TIPO_DE_EMPREGO: Record<string, string> = {
  clt: 'FULL_TIME',
  pj: 'CONTRACTOR',
  freelancer: 'CONTRACTOR',
  contractor: 'CONTRACTOR',
  estagio: 'INTERN',
}

const PERIODO_SALARIAL: Record<string, string> = {
  hour: 'HOUR',
  month: 'MONTH',
  year: 'YEAR',
}

export function tituloDaVaga(job: Pick<JobDetail, 'title' | 'company'>): string {
  return `${job.title} — ${job.company.name} | Vagas Coding Ferpa`
}

export function jobPostingJsonLd(job: JobDetail, url: string) {
  const salarioMin = job.salary.min === null ? null : Number(job.salary.min)
  const salarioMax = job.salary.max === null ? null : Number(job.salary.max)
  const temSalario = salarioMin !== null || salarioMax !== null
  const remoto = job.workMode?.slug === 'remoto'

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.descriptionMd,
    identifier: {
      '@type': 'PropertyValue',
      name: job.company.name,
      value: job.slug,
    },
    datePosted: job.publishedAt,
    // Arquivada mantém o JSON-LD com validThrough no passado: é o sinal
    // correto de expiração para o Google (doc 08).
    ...(job.expiresAt ? { validThrough: job.expiresAt } : {}),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company.name,
      ...(job.company.logoUrl ? { logo: job.company.logoUrl } : {}),
    },
    ...(job.contractType && TIPO_DE_EMPREGO[job.contractType.slug]
      ? { employmentType: TIPO_DE_EMPREGO[job.contractType.slug] }
      : {}),
    ...(remoto
      ? {
          jobLocationType: 'TELECOMMUTE',
          ...(job.location.country
            ? {
                applicantLocationRequirements: {
                  '@type': 'Country',
                  name: job.location.country,
                },
              }
            : {}),
        }
      : {}),
    ...(job.location.city || job.location.country
      ? {
          jobLocation: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              ...(job.location.city ? { addressLocality: job.location.city } : {}),
              ...(job.location.state ? { addressRegion: job.location.state } : {}),
              ...(job.location.country ? { addressCountry: job.location.country } : {}),
            },
          },
        }
      : {}),
    ...(temSalario
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: job.salary.currency ?? 'BRL',
            value: {
              '@type': 'QuantitativeValue',
              ...(salarioMin !== null ? { minValue: salarioMin } : {}),
              ...(salarioMax !== null ? { maxValue: salarioMax } : {}),
              unitText: PERIODO_SALARIAL[job.salary.period] ?? 'MONTH',
            },
          },
        }
      : {}),
    // A candidatura acontece no site de origem, não aqui.
    directApply: false,
    url,
  }
}

export function breadcrumbJsonLd(
  job: Pick<JobDetail, 'title'>,
  url: string,
  base: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: base },
      { '@type': 'ListItem', position: 2, name: 'Vagas', item: base },
      { '@type': 'ListItem', position: 3, name: job.title, item: url },
    ],
  }
}
