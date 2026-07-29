import { z } from 'zod'

import { USER_ROLES } from '@/lib/roles'

/**
 * Schemas de empresa, taxonomia e papel (doc 06). Mesmas regras no resolver do
 * formulário e na Server Action.
 */

const urlOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor.length > 0 ? valor : null))
  .nullable()
  .refine((valor) => valor === null || z.url().safeParse(valor).success, {
    message: 'Informe uma URL válida, com https://.',
  })

export const empresaSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, 'O nome precisa de pelo menos 2 caracteres.'),
  website: urlOpcional,
  logoUrl: urlOpcional,
  description: z
    .string()
    .trim()
    .transform((valor) => (valor.length > 0 ? valor : null))
    .nullable(),
})

export const TIPOS_DE_TAXONOMIA = [
  'technology',
  'role',
  'seniority',
  'work_mode',
  'contract_type',
  'tag',
] as const

export const KINDS_DE_TECNOLOGIA = [
  'language',
  'framework',
  'database',
  'cloud',
  'tool',
] as const

export const taxonomiaSchema = z.object({
  kind: z.enum(TIPOS_DE_TAXONOMIA),
  id: z.uuid().optional(),
  label: z.string().trim().min(2, 'O rótulo precisa de pelo menos 2 caracteres.'),
  /** Aliases servem ao mapeamento da IA (doc 05): uma por linha. */
  aliases: z
    .string()
    .default('')
    .transform((valor) =>
      valor
        .split('\n')
        .map((linha) => linha.trim().toLowerCase())
        .filter((linha) => linha.length > 0),
    ),
  /** Só para `technology`; ignorado nos demais tipos. */
  technologyKind: z.enum(KINDS_DE_TECNOLOGIA).nullable().default(null),
  /** Só para `seniority`, que ordena de estágio a principal. */
  rank: z.coerce.number().int().min(0).max(100).nullable().default(null),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
})

export const desativarTaxonomiaSchema = z.object({
  kind: z.enum(TIPOS_DE_TAXONOMIA),
  id: z.uuid(),
  isActive: z.boolean(),
})

export const papelSchema = z.object({
  userId: z.uuid(),
  role: z.enum(USER_ROLES),
})

export type EntradaDeEmpresa = z.input<typeof empresaSchema>
export type EntradaDeTaxonomia = z.input<typeof taxonomiaSchema>
