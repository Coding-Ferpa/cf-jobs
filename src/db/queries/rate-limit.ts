import 'server-only'

import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import { queryAsAnon } from '@/db/client'
import {
  chaveDeLimite,
  JANELA_EM_SEGUNDOS,
  type ResultadoDeLimite,
} from '@/lib/api/rate-limit'
import { requireAnalyticsSalt } from '@/lib/env'
import { ipDaRequisicao, ipHash } from '@/lib/visitor'

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

/**
 * Sal do hash de IP. Reaproveita o do `visitor_hash` quando existe; sem ele,
 * um sal sorteado no boot do processo mantém o endereço fora do banco do mesmo
 * jeito. O limite passa a valer por instância nesse caso — degradação bem mais
 * aceitável que devolver 503 na API pública por uma variável opcional.
 */
const SAL_DE_PROCESSO = randomUUID()

function salDoLimite(): string {
  try {
    return requireAnalyticsSalt()
  } catch {
    return SAL_DE_PROCESSO
  }
}

/** Consome o balde de quem fez a requisição, por IP (doc 07). */
export async function limitarCliente(
  headers: Headers,
  escopo: 'api' | 'events',
  limite: number,
): Promise<ResultadoDeLimite> {
  const chave = chaveDeLimite(escopo, ipHash(ipDaRequisicao(headers), salDoLimite()))
  return consumirLimite(chave, limite)
}
