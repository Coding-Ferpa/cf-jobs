import { z } from 'zod'

/**
 * Cursor opaco de paginação (doc 06): base64 de `(published_at, id)`.
 *
 * É par, não offset, porque offset relê tudo que já passou e ainda pula linha
 * quando algo é publicado no meio da navegação. O `id` desempata vagas
 * publicadas no mesmo instante — sem ele a ordenação não é estável.
 */

/** Tamanho de página do doc 06. Mora aqui para a API e o banco lerem o mesmo. */
export const LIMITE_PADRAO = 20
export const LIMITE_MAXIMO = 50

const cursorSchema = z.object({
  p: z.string().min(1),
  i: z.uuid(),
})

export type JobCursor = {
  publishedAt: Date
  id: string
}

export function encodeCursor({ publishedAt, id }: JobCursor): string {
  const payload = JSON.stringify({ p: publishedAt.toISOString(), i: id })
  return Buffer.from(payload, 'utf8').toString('base64url')
}

/** Cursor inválido é tratado como ausente: a listagem recomeça do topo. */
export function decodeCursor(value: string | null | undefined): JobCursor | null {
  if (typeof value !== 'string' || value.length === 0) return null

  try {
    const payload: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    const parsed = cursorSchema.safeParse(payload)
    if (!parsed.success) return null

    const publishedAt = new Date(parsed.data.p)
    if (Number.isNaN(publishedAt.getTime())) return null

    return { publishedAt, id: parsed.data.i }
  } catch {
    return null
  }
}
