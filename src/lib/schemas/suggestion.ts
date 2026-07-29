import { z } from '@/lib/zod'

import { KINDS_DE_TECNOLOGIA } from '@/lib/schemas/admin'

/**
 * Entrada das ações da fila de sugestões (doc 05). Aprovar aceita ajustar o
 * rótulo antes de criar — o termo que a IA extraiu costuma vir com a grafia da
 * vaga ("react js"), e quem revisa é quem decide como ele fica no cadastro.
 */

export const aprovarSugestaoSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().min(2).max(60).optional(),
  /** Só para tecnologia; ignorado nos demais tipos. */
  technologyKind: z.enum(KINDS_DE_TECNOLOGIA).nullish(),
  /** Só para senioridade, que ordena de estágio a principal. */
  rank: z.coerce.number().int().min(0).max(100).nullish(),
})

export const mesclarSugestaoSchema = z.object({
  id: z.uuid(),
  taxonomyId: z.uuid(),
})

export const rejeitarSugestaoSchema = z.object({
  id: z.uuid(),
})
