import 'server-only'

import { sql, type SQL } from 'drizzle-orm'

import { queryAsAnon } from '@/db/client'
import { decodeCursor, encodeCursor } from '@/lib/cursor'

/**
 * Leituras públicas de vagas (doc 06). A área pública e a API v1 compartilham
 * estas funções: uma implementação, duas portas.
 *
 * O SQL é escrito à mão de propósito — com filtros combináveis, agregação de
 * tecnologias e paginação por cursor, uma query formatada se lê melhor que a
 * mesma coisa montada em joins condicionais. Todo valor entra parametrizado.
 */

export const LIMITE_PADRAO = 20
export const LIMITE_MAXIMO = 50

export type JobStatusFilter = 'published' | 'archived' | 'all'
export type JobSort = 'recent' | 'relevance'

export type JobFilters = {
  q?: string
  tech?: string[]
  role?: string[]
  seniority?: string[]
  workMode?: string[]
  contractType?: string[]
  tag?: string[]
  company?: string[]
  city?: string
  state?: string
  country?: string
  status?: JobStatusFilter
  sort?: JobSort
  cursor?: string | null
  limit?: number
}

export type TaxonomyRef = { slug: string; label: string }

export type JobTechnologyRef = TaxonomyRef & { isPrimary: boolean }

export type JobListItem = {
  slug: string
  title: string
  summary: string | null
  company: { name: string; slug: string; logoUrl: string | null }
  roleCategory: TaxonomyRef | null
  seniority: TaxonomyRef | null
  workMode: TaxonomyRef | null
  contractType: TaxonomyRef | null
  location: { city: string | null; state: string | null; country: string | null }
  salary: {
    min: string | null
    max: string | null
    currency: string | null
    period: string
  }
  technologies: JobTechnologyRef[]
  tags: TaxonomyRef[]
  status: 'published' | 'archived'
  publishedAt: Date | null
  expiresAt: Date | null
}

export type JobDetail = JobListItem & {
  descriptionMd: string
  benefits: string[]
  keywords: string[]
  language: string
  applyUrl: string
  sourceUrl: string
  sourceSite: string | null
  updatedAt: Date
  archivedAt: Date | null
}

export type JobList = {
  jobs: JobListItem[]
  nextCursor: string | null
  hasMore: boolean
}

export type FacetKind =
  'technology' | 'role' | 'seniority' | 'work_mode' | 'contract_type' | 'tag' | 'company'

export type Facet = { kind: FacetKind; slug: string; label: string; count: number }

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/**
 * Lista de valores parametrizada para `in (...)`. Interpolar o array direto
 * faria o Postgres receber um literal de array malformado.
 */
function listaDeValores(values: string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

function naoVazio(values?: string[]): string[] | null {
  const limpos = (values ?? []).map((v) => v.trim()).filter((v) => v.length > 0)
  return limpos.length > 0 ? limpos : null
}

/**
 * Monta o WHERE compartilhado por listagem e facetas. OR dentro do mesmo
 * parâmetro, AND entre parâmetros — exceto tecnologia, que é AND também entre
 * valores: quem filtra React e TypeScript quer as duas (doc 06).
 */
function condicoesDeFiltro(filters: JobFilters): SQL {
  const status = filters.status ?? 'published'
  const condicoes: SQL[] = []

  if (status === 'all') {
    condicoes.push(sql`j.status in ('published', 'archived')`)
  } else {
    condicoes.push(sql`j.status = ${status}::public.job_status`)
  }

  const q = filters.q?.trim()
  if (q) {
    // O tsvector tem português e simple; consultar os dois cobre vaga em inglês.
    condicoes.push(
      sql`j.search @@ (
        websearch_to_tsquery('pg_catalog.portuguese', ${q})
        || websearch_to_tsquery('pg_catalog.simple', ${q})
      )`,
    )
  }

  const role = naoVazio(filters.role)
  if (role) {
    condicoes.push(
      sql`j.role_category_id in (
        select id from public.role_categories where slug in (${listaDeValores(role)})
      )`,
    )
  }

  const seniority = naoVazio(filters.seniority)
  if (seniority) {
    condicoes.push(
      sql`j.seniority_id in (
        select id from public.seniority_levels where slug in (${listaDeValores(seniority)})
      )`,
    )
  }

  const workMode = naoVazio(filters.workMode)
  if (workMode) {
    condicoes.push(
      sql`j.work_mode_id in (
        select id from public.work_modes where slug in (${listaDeValores(workMode)})
      )`,
    )
  }

  const contractType = naoVazio(filters.contractType)
  if (contractType) {
    condicoes.push(
      sql`j.contract_type_id in (
        select id from public.contract_types where slug in (${listaDeValores(contractType)})
      )`,
    )
  }

  const company = naoVazio(filters.company)
  if (company) {
    condicoes.push(
      sql`j.company_id in (
        select id from public.companies where slug in (${listaDeValores(company)})
      )`,
    )
  }

  const tech = naoVazio(filters.tech)
  if (tech) {
    condicoes.push(
      sql`(
        select count(distinct t.slug)
          from public.job_technologies jt
          join public.technologies t on t.id = jt.technology_id
         where jt.job_id = j.id and t.slug in (${listaDeValores(tech)})
      ) = ${tech.length}`,
    )
  }

  const tag = naoVazio(filters.tag)
  if (tag) {
    condicoes.push(
      sql`exists (
        select 1
          from public.job_tags jtg
          join public.tags tg on tg.id = jtg.tag_id
         where jtg.job_id = j.id and tg.slug in (${listaDeValores(tag)})
      )`,
    )
  }

  if (filters.city?.trim()) {
    condicoes.push(sql`lower(j.location_city) = lower(${filters.city.trim()})`)
  }
  if (filters.state?.trim()) {
    condicoes.push(sql`lower(j.location_state) = lower(${filters.state.trim()})`)
  }
  if (filters.country?.trim()) {
    condicoes.push(sql`upper(j.location_country) = upper(${filters.country.trim()})`)
  }

  return sql.join(condicoes, sql` and `)
}

/** Colunas de card e de detalhe, com as taxonomias já resolvidas. */
const COLUNAS_DE_CARD = sql`
  j.slug,
  j.title,
  j.summary,
  j.status,
  j.published_at as "publishedAt",
  j.expires_at as "expiresAt",
  j.location_city as "locationCity",
  j.location_state as "locationState",
  j.location_country as "locationCountry",
  j.salary_min as "salaryMin",
  j.salary_max as "salaryMax",
  j.salary_currency as "salaryCurrency",
  j.salary_period as "salaryPeriod",
  c.name as "companyName",
  c.slug as "companySlug",
  c.logo_url as "companyLogoUrl",
  rc.slug as "roleSlug", rc.label as "roleLabel",
  sl.slug as "senioritySlug", sl.label as "seniorityLabel",
  wm.slug as "workModeSlug", wm.label as "workModeLabel",
  ct.slug as "contractSlug", ct.label as "contractLabel",
  coalesce(tech.itens, '[]'::json) as technologies,
  coalesce(tg.itens, '[]'::json) as tags
`

const JUNCOES_DE_CARD = sql`
  join public.companies c on c.id = j.company_id
  left join public.role_categories rc on rc.id = j.role_category_id
  left join public.seniority_levels sl on sl.id = j.seniority_id
  left join public.work_modes wm on wm.id = j.work_mode_id
  left join public.contract_types ct on ct.id = j.contract_type_id
  left join lateral (
    select json_agg(
      json_build_object('slug', t.slug, 'label', t.label, 'isPrimary', jt.is_primary)
      order by jt.is_primary desc, t.label
    ) as itens
      from public.job_technologies jt
      join public.technologies t on t.id = jt.technology_id
     where jt.job_id = j.id
  ) tech on true
  left join lateral (
    select json_agg(
      json_build_object('slug', tg2.slug, 'label', tg2.label) order by tg2.sort_order
    ) as itens
      from public.job_tags jtg
      join public.tags tg2 on tg2.id = jtg.tag_id
     where jtg.job_id = j.id
  ) tg on true
`

/**
 * Em query crua o driver devolve timestamptz como texto — a conversão para
 * Date é feita aqui, no lugar onde o Drizzle faria se fosse query builder.
 */
type DataBruta = string | Date | null

function paraData(valor: DataBruta): Date | null {
  if (valor === null) return null
  return valor instanceof Date ? valor : new Date(valor)
}

type LinhaDeCard = {
  slug: string
  title: string
  summary: string | null
  status: 'published' | 'archived'
  publishedAt: DataBruta
  expiresAt: DataBruta
  locationCity: string | null
  locationState: string | null
  locationCountry: string | null
  salaryMin: string | null
  salaryMax: string | null
  salaryCurrency: string | null
  salaryPeriod: string
  companyName: string
  companySlug: string
  companyLogoUrl: string | null
  roleSlug: string | null
  roleLabel: string | null
  senioritySlug: string | null
  seniorityLabel: string | null
  workModeSlug: string | null
  workModeLabel: string | null
  contractSlug: string | null
  contractLabel: string | null
  technologies: JobTechnologyRef[]
  tags: TaxonomyRef[]
}

function taxonomia(slug: string | null, label: string | null): TaxonomyRef | null {
  return slug && label ? { slug, label } : null
}

function paraJobListItem(linha: LinhaDeCard): JobListItem {
  return {
    slug: linha.slug,
    title: linha.title,
    summary: linha.summary,
    company: {
      name: linha.companyName,
      slug: linha.companySlug,
      logoUrl: linha.companyLogoUrl,
    },
    roleCategory: taxonomia(linha.roleSlug, linha.roleLabel),
    seniority: taxonomia(linha.senioritySlug, linha.seniorityLabel),
    workMode: taxonomia(linha.workModeSlug, linha.workModeLabel),
    contractType: taxonomia(linha.contractSlug, linha.contractLabel),
    location: {
      city: linha.locationCity,
      state: linha.locationState,
      country: linha.locationCountry,
    },
    salary: {
      min: linha.salaryMin,
      max: linha.salaryMax,
      currency: linha.salaryCurrency,
      period: linha.salaryPeriod,
    },
    technologies: linha.technologies,
    tags: linha.tags,
    status: linha.status,
    publishedAt: paraData(linha.publishedAt),
    expiresAt: paraData(linha.expiresAt),
  }
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export async function listJobs(filters: JobFilters = {}): Promise<JobList> {
  const limite = Math.min(Math.max(filters.limit ?? LIMITE_PADRAO, 1), LIMITE_MAXIMO)
  const cursor = decodeCursor(filters.cursor)
  const ordenarPorRelevancia = filters.sort === 'relevance' && Boolean(filters.q?.trim())

  const condicoes = [condicoesDeFiltro(filters)]
  if (cursor) {
    // Comparação de tupla: usa o índice (status, published_at desc) direto.
    condicoes.push(
      sql`(j.published_at, j.id) < (${cursor.publishedAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
    )
  }

  const ordenacao = ordenarPorRelevancia
    ? sql`order by ts_rank(j.search, websearch_to_tsquery('pg_catalog.portuguese', ${filters.q?.trim() ?? ''})) desc, j.published_at desc, j.id desc`
    : sql`order by j.published_at desc, j.id desc`

  const linhas = await queryAsAnon(async (tx) => {
    const resultado = await tx.execute<LinhaDeCard & { id: string }>(sql`
      select j.id, ${COLUNAS_DE_CARD}
        from public.jobs j
        ${JUNCOES_DE_CARD}
       where ${sql.join(condicoes, sql` and `)}
       ${ordenacao}
       limit ${limite + 1}
    `)
    return resultado as unknown as (LinhaDeCard & { id: string })[]
  })

  // Pedimos uma linha a mais só para saber se existe próxima página.
  const hasMore = linhas.length > limite
  const pagina = hasMore ? linhas.slice(0, limite) : linhas
  const ultima = pagina.at(-1)
  const ultimaData = ultima ? paraData(ultima.publishedAt) : null

  return {
    jobs: pagina.map(paraJobListItem),
    hasMore,
    nextCursor:
      hasMore && ultima && ultimaData
        ? encodeCursor({ publishedAt: ultimaData, id: ultima.id })
        : null,
  }
}

export async function getJobBySlug(slug: string): Promise<JobDetail | null> {
  const linhas = await queryAsAnon(async (tx) => {
    const resultado = await tx.execute<
      LinhaDeCard & {
        descriptionMd: string
        benefits: string[]
        keywords: string[]
        language: string
        applyUrl: string
        sourceUrl: string
        sourceSite: string | null
        updatedAt: DataBruta
        archivedAt: DataBruta
      }
    >(sql`
      select
        ${COLUNAS_DE_CARD},
        j.description_md as "descriptionMd",
        j.benefits,
        j.keywords,
        j.language,
        j.apply_url as "applyUrl",
        j.source_url as "sourceUrl",
        j.source_site as "sourceSite",
        j.updated_at as "updatedAt",
        j.archived_at as "archivedAt"
      from public.jobs j
      ${JUNCOES_DE_CARD}
      where j.slug = ${slug}
      limit 1
    `)
    return resultado as unknown as (LinhaDeCard & {
      descriptionMd: string
      benefits: string[]
      keywords: string[]
      language: string
      applyUrl: string
      sourceUrl: string
      sourceSite: string | null
      updatedAt: DataBruta
      archivedAt: DataBruta
    })[]
  })

  const linha = linhas.at(0)
  if (!linha) return null

  return {
    ...paraJobListItem(linha),
    descriptionMd: linha.descriptionMd,
    benefits: linha.benefits,
    keywords: linha.keywords,
    language: linha.language,
    applyUrl: linha.applyUrl,
    sourceUrl: linha.sourceUrl,
    sourceSite: linha.sourceSite,
    updatedAt: paraData(linha.updatedAt) ?? new Date(),
    archivedAt: paraData(linha.archivedAt),
  }
}

/** Mesma área de atuação ou tecnologia em comum, publicadas, exceto a atual. */
export async function listSimilarJobs(slug: string, limite = 3): Promise<JobListItem[]> {
  const linhas = await queryAsAnon(async (tx) => {
    const resultado = await tx.execute<LinhaDeCard>(sql`
      with atual as (
        select id, role_category_id from public.jobs where slug = ${slug}
      ),
      tecnologias_da_atual as (
        select jt.technology_id from public.job_technologies jt, atual
         where jt.job_id = atual.id
      )
      select ${COLUNAS_DE_CARD}
        from public.jobs j
        ${JUNCOES_DE_CARD}
       where j.status = 'published'
         and j.id <> (select id from atual)
         and (
           j.role_category_id = (select role_category_id from atual)
           or exists (
             select 1 from public.job_technologies jt
              where jt.job_id = j.id
                and jt.technology_id in (select technology_id from tecnologias_da_atual)
           )
         )
       order by j.published_at desc
       limit ${limite}
    `)
    return resultado as unknown as LinhaDeCard[]
  })

  return linhas.map(paraJobListItem)
}

/**
 * Contagem por opção de filtro, calculada ao vivo sobre o conjunto filtrado
 * (doc 04: a materialized view só entra quando o volume pedir).
 */
export async function getFacets(filters: JobFilters = {}): Promise<Facet[]> {
  const condicoes = condicoesDeFiltro(filters)

  const linhas = await queryAsAnon(async (tx) => {
    const resultado = await tx.execute<Facet>(sql`
      with filtradas as (
        select j.id, j.role_category_id, j.seniority_id, j.work_mode_id,
               j.contract_type_id, j.company_id
          from public.jobs j
         where ${condicoes}
      )
      select 'technology' as kind, t.slug, t.label, count(*)::int as count
        from filtradas f
        join public.job_technologies jt on jt.job_id = f.id
        join public.technologies t on t.id = jt.technology_id
       group by t.slug, t.label
      union all
      select 'tag', tg.slug, tg.label, count(*)::int
        from filtradas f
        join public.job_tags jtg on jtg.job_id = f.id
        join public.tags tg on tg.id = jtg.tag_id
       group by tg.slug, tg.label
      union all
      select 'role', rc.slug, rc.label, count(*)::int
        from filtradas f
        join public.role_categories rc on rc.id = f.role_category_id
       group by rc.slug, rc.label
      union all
      select 'seniority', sl.slug, sl.label, count(*)::int
        from filtradas f
        join public.seniority_levels sl on sl.id = f.seniority_id
       group by sl.slug, sl.label
      union all
      select 'work_mode', wm.slug, wm.label, count(*)::int
        from filtradas f
        join public.work_modes wm on wm.id = f.work_mode_id
       group by wm.slug, wm.label
      union all
      select 'contract_type', ct.slug, ct.label, count(*)::int
        from filtradas f
        join public.contract_types ct on ct.id = f.contract_type_id
       group by ct.slug, ct.label
      union all
      select 'company', c.slug, c.name, count(*)::int
        from filtradas f
        join public.companies c on c.id = f.company_id
       group by c.slug, c.name
      order by count desc, label
    `)
    return resultado as unknown as Facet[]
  })

  return linhas
}

/** Slugs de todas as vagas publicadas — usado pelo sitemap e pelo SSG. */
export async function listPublishedJobSlugs(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  const linhas = await queryAsAnon(async (tx) => {
    const resultado = await tx.execute<{ slug: string; updatedAt: DataBruta }>(sql`
      select slug, updated_at as "updatedAt"
        from public.jobs
       where status = 'published'
       order by published_at desc
    `)
    return resultado as unknown as { slug: string; updatedAt: DataBruta }[]
  })

  return linhas.map((linha) => ({
    slug: linha.slug,
    updatedAt: paraData(linha.updatedAt) ?? new Date(),
  }))
}
