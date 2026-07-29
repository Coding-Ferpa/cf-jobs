import 'server-only'

import { sql } from 'drizzle-orm'

import { queryAsAnon } from '@/db/client'
import { JANELA_EM_SEGUNDOS, type ResultadoDeLimite } from '@/lib/api/rate-limit'

/**
 * Consome uma unidade do balde e devolve o estado da janela (doc 07). Quem
 * conta é o Postgres, com `on conflict` atômico: sem Redis, sem custo, e o
 * limite vale para todas as instâncias da função ao mesmo tempo.
 */
export async function consumirLimite(
  chave: string,
  limite: number,
): Promise<ResultadoDeLimite> {
  const linhas = await queryAsAnon(async (tx) => {
    const resultado = await tx.execute<{
      allowed: boolean
      remaining: number
      reset_at: string | Date
    }>(sql`
      select allowed, remaining, reset_at
        from public.check_rate_limit(
          ${chave},
          ${limite},
          make_interval(secs => ${JANELA_EM_SEGUNDOS})
        )
    `)
    return resultado as unknown as {
      allowed: boolean
      remaining: number
      reset_at: string | Date
    }[]
  })

  const linha = linhas.at(0)

  // Sem linha não há como afirmar que estourou: negar aqui transformaria uma
  // falha nossa em 429 para quem não fez nada errado.
  if (!linha) {
    return {
      permitido: true,
      limite,
      restantes: limite,
      reiniciaEm: Math.floor(Date.now() / 1000) + JANELA_EM_SEGUNDOS,
    }
  }

  const reset = linha.reset_at instanceof Date ? linha.reset_at : new Date(linha.reset_at)

  return {
    permitido: linha.allowed,
    limite,
    restantes: Number(linha.remaining),
    reiniciaEm: Math.floor(reset.getTime() / 1000),
  }
}
