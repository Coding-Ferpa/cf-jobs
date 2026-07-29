import 'server-only'

import { sql } from 'drizzle-orm'

import { db, type Transaction } from '@/db/client'
import type {
  Catalogo,
  Correspondencia,
  TipoDeTaxonomia,
  ViaDoMatch,
} from '@/features/import/map-taxonomies'

/**
 * O lado SQL da etapa 4 do doc 05: exato → alias → semelhança por trigram.
 *
 * As três estratégias cabem em uma consulta só porque a diferença entre elas é
 * a cláusula que casou, não o caminho percorrido — o `order by` do lateral
 * escolhe a melhor por termo. Fazer três consultas em cascata custaria três
 * idas ao banco para dizer a mesma coisa.
 *
 * `features/import` recebe isto como porta (`Catalogo`) e não importa este
 * arquivo: é o que mantém o pipeline testável sem Postgres (doc 02).
 */

/** Doc 05: acima disto a semelhança é confiável o bastante para casar sozinha. */
export const LIMIAR_DE_SEMELHANCA = 0.85

const TABELA: Record<TipoDeTaxonomia, string> = {
  technology: 'technologies',
  tag: 'tags',
  role_category: 'role_categories',
  seniority_level: 'seniority_levels',
  work_mode: 'work_modes',
  contract_type: 'contract_types',
}

type Linha = {
  termo: string
  id: string
  slug: string
  label: string
  via: ViaDoMatch
  similaridade: number | null
}

async function resolverEm(
  tx: Transaction,
  tipo: TipoDeTaxonomia,
  termos: string[],
): Promise<Correspondencia[]> {
  // O `%` do pg_trgm compara com este limiar e é o que usa o índice GIN das
  // labels (doc 04). Vale só para esta transação.
  await tx.execute(
    sql`set local pg_trgm.similarity_threshold = ${sql.raw(String(LIMIAR_DE_SEMELHANCA))}`,
  )

  // O nome da tabela vem de `TABELA`, um mapa fechado — nunca de entrada.
  const tabela = sql.raw(`public.${TABELA[tipo]}`)

  const linhas = await tx.execute<Linha>(sql`
    with termos as (
      -- Os termos viajam como JSON e não como array: o driver serializa
      -- text[] de forma ambígua para um único elemento.
      select distinct btrim(termo) as termo
        from jsonb_array_elements_text(${JSON.stringify(termos)}::jsonb) as termo
       where btrim(termo) <> ''
    )
    select t.termo, m.id, m.slug, m.label, m.via, m.similaridade
      from termos t
      cross join lateral (
        select lk.id,
               lk.slug,
               lk.label,
               case
                 when lower(lk.slug) = lower(t.termo) then 'exato'
                 when exists (
                   select 1 from unnest(lk.aliases) as alias
                    where lower(alias) = lower(t.termo)
                 ) then 'alias'
                 else 'trigram'
               end as via,
               similarity(lk.label, t.termo) as similaridade
          from ${tabela} lk
         where lk.is_active
           and (
             lower(lk.slug) = lower(t.termo)
             or exists (
               select 1 from unnest(lk.aliases) as alias
                where lower(alias) = lower(t.termo)
             )
             or lk.label % t.termo
           )
         -- Exato ganha de alias, que ganha de semelhança; entre semelhantes,
         -- a maior. Sem esta ordem o limit devolveria qualquer uma.
         order by case
                    when lower(lk.slug) = lower(t.termo) then 0
                    when exists (
                      select 1 from unnest(lk.aliases) as alias
                       where lower(alias) = lower(t.termo)
                    ) then 1
                    else 2
                  end,
                  similarity(lk.label, t.termo) desc,
                  lk.slug
         limit 1
      ) m
  `)

  return (linhas as unknown as Linha[]).map((linha) => ({
    termo: linha.termo,
    id: linha.id,
    slug: linha.slug,
    label: linha.label,
    via: linha.via,
    ...(linha.via === 'trigram' ? { similaridade: Number(linha.similaridade ?? 0) } : {}),
  }))
}

/**
 * Catálogo ligado ao banco. Cada tipo é uma consulta, com os termos em lote —
 * uma vaga inteira custa no máximo seis idas.
 */
export function catalogoDoBanco(): Catalogo {
  return {
    async resolver(tipo, termos) {
      if (termos.length === 0) return []
      return db.transaction(async (tx) => resolverEm(tx, tipo, termos))
    },
  }
}
