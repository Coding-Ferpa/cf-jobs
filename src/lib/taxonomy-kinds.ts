import type { TIPOS_DE_TAXONOMIA } from '@/lib/schemas/admin'

type TaxonomyKind = (typeof TIPOS_DE_TAXONOMIA)[number]

/**
 * O `kind` das sugestões e o das telas de taxonomia não têm os mesmos nomes.
 *
 * O primeiro vem do check da migration 0005 (`role_category`,
 * `seniority_level`) e já está gravado em linhas existentes; o segundo (`role`,
 * `seniority`) está em URLs do admin. Renomear qualquer um dos dois custa mais
 * do que manter o mapa — e o mapa mora em `lib/` porque banco e componente
 * precisam dele.
 */

const KIND_NO_ADMIN: Record<string, TaxonomyKind> = {
  technology: 'technology',
  tag: 'tag',
  role_category: 'role',
  seniority_level: 'seniority',
  work_mode: 'work_mode',
  contract_type: 'contract_type',
}

export function kindNoAdmin(kind: string): TaxonomyKind | null {
  return KIND_NO_ADMIN[kind] ?? null
}

/** Rótulo no singular: aparece ao lado de um termo, não como título de lista. */
export const ROTULO_DO_KIND: Record<string, string> = {
  technology: 'Tecnologia',
  tag: 'Tag',
  role_category: 'Cargo',
  seniority_level: 'Senioridade',
  work_mode: 'Modalidade',
  contract_type: 'Contratação',
}
