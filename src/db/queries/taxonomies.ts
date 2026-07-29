import 'server-only'

import { unstable_cache } from 'next/cache'

import { sql } from 'drizzle-orm'

import { db, queryAsAnon } from '@/db/client'
import type { ListasDeOpcoes } from '@/features/import/prompt'

/**
 * Taxonomias ativas, agrupadas por tipo (doc 06). Existe para quem integra
 * montar os próprios filtros sem adivinhar slug — é a contraparte de leitura
 * dos parâmetros de `GET /api/v1/jobs`.
 *
 * Só o que está ativo sai: taxonomia desativada continua no banco por causa do
 * histórico das vagas antigas, mas oferecê-la como filtro devolveria vazio.
 */

export type TaxonomyItem = {
  slug: string
  label: string
  /** Só em `technologies`: linguagem, framework, banco, cloud, ferramenta. */
  kind?: string
}

export type Taxonomies = {
  technologies: TaxonomyItem[]
  role_categories: TaxonomyItem[]
  seniority_levels: TaxonomyItem[]
  work_modes: TaxonomyItem[]
  contract_types: TaxonomyItem[]
  tags: TaxonomyItem[]
}

type Linha = { grupo: keyof Taxonomies; slug: string; label: string; kind: string | null }

export async function getTaxonomies(): Promise<Taxonomies> {
  const linhas = await queryAsAnon(async (tx) => {
    // Uma ida ao banco em vez de seis: são tabelas pequenas e a resposta é
    // cacheada por uma hora de qualquer jeito.
    const resultado = await tx.execute<Linha>(sql`
      select 'technologies' as grupo, slug, label, kind::text as kind, sort_order, label as ordem
        from public.technologies where is_active
      union all
      select 'role_categories', slug, label, null, sort_order, label
        from public.role_categories where is_active
      union all
      select 'seniority_levels', slug, label, null, rank, label
        from public.seniority_levels where is_active
      union all
      select 'work_modes', slug, label, null, sort_order, label
        from public.work_modes where is_active
      union all
      select 'contract_types', slug, label, null, sort_order, label
        from public.contract_types where is_active
      union all
      select 'tags', slug, label, null, sort_order, label
        from public.tags where is_active
      order by grupo, sort_order, ordem
    `)
    return resultado as unknown as Linha[]
  })

  const agrupadas: Taxonomies = {
    technologies: [],
    role_categories: [],
    seniority_levels: [],
    work_modes: [],
    contract_types: [],
    tags: [],
  }

  for (const linha of linhas) {
    const grupo = agrupadas[linha.grupo]
    if (!grupo) continue

    grupo.push(
      linha.kind === null
        ? { slug: linha.slug, label: linha.label }
        : { slug: linha.slug, label: linha.label, kind: linha.kind },
    )
  }

  return agrupadas
}

/** Cinco minutos, como manda o doc 05: taxonomia muda pouco e o prompt é caro. */
const SEGUNDOS_DE_CACHE_DO_PROMPT = 300

type LinhaComAliases = {
  grupo: keyof ListasDeOpcoes
  slug: string
  label: string
  kind: string | null
  aliases: string[]
}

/**
 * As listas que vão no prompt da IA (doc 05, etapa 3). São as mesmas
 * taxonomias de `getTaxonomies`, mas com **aliases** — é o que faz o modelo
 * reconhecer "ReactJS" como `react` sem depender do fuzzy depois.
 *
 * Roda pela conexão da aplicação e não como `anon`: quem autoriza é a action
 * que chamou o pipeline, e taxonomia inativa fica de fora aqui do mesmo jeito.
 */
async function lerListasParaOPrompt(): Promise<ListasDeOpcoes> {
  const resultado = await db.execute<LinhaComAliases>(sql`
    select 'technologies' as grupo, slug, label, kind::text as kind, aliases, sort_order
      from public.technologies where is_active
    union all
    select 'role_categories', slug, label, null, aliases, sort_order
      from public.role_categories where is_active
    union all
    select 'seniority_levels', slug, label, null, aliases, rank
      from public.seniority_levels where is_active
    union all
    select 'work_modes', slug, label, null, aliases, sort_order
      from public.work_modes where is_active
    union all
    select 'contract_types', slug, label, null, aliases, sort_order
      from public.contract_types where is_active
    union all
    select 'tags', slug, label, null, aliases, sort_order
      from public.tags where is_active
    order by grupo, sort_order, label
  `)

  const listas: ListasDeOpcoes = {
    technologies: [],
    role_categories: [],
    seniority_levels: [],
    work_modes: [],
    contract_types: [],
    tags: [],
  }

  for (const linha of resultado as unknown as LinhaComAliases[]) {
    listas[linha.grupo]?.push({
      slug: linha.slug,
      label: linha.label,
      kind: linha.kind,
      aliases: linha.aliases ?? [],
    })
  }

  return listas
}

/**
 * A tag é a mesma `jobs` que as mutations de taxonomia já derrubam (doc 06):
 * cadastrar uma tecnologia nova tem que refletir no próximo prompt, não daqui
 * a cinco minutos.
 */
export const listasParaOPrompt = unstable_cache(
  lerListasParaOPrompt,
  ['import:listas-de-taxonomias'],
  { revalidate: SEGUNDOS_DE_CACHE_DO_PROMPT, tags: ['jobs'] },
)
