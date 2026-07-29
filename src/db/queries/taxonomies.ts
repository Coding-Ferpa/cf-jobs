import 'server-only'

import { sql } from 'drizzle-orm'

import { queryAsAnon } from '@/db/client'

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
