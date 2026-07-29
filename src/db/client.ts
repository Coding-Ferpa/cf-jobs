import 'server-only'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { serverEnv } from '@/lib/env'

import * as schema from './schema'

/**
 * Conexão de leitura da aplicação, pelo pooler do Supabase em modo transaction
 * (doc 01). A RLS é quem autoriza cada linha — este cliente não tem privilégio
 * especial nenhum.
 *
 * O cliente com service_role, usado apenas em Server Actions que já validaram
 * sessão e papel, entra no M2, junto com a autenticação.
 */

// O modo transaction do Supavisor não suporta prepared statements.
const client = postgres(serverEnv().DATABASE_URL, { prepare: false })

export const db = drizzle(client, { schema })

export type Database = typeof db
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Roda a consulta com a role `anon`, para que a RLS valha de fato (doc 01).
 *
 * A string de conexão do pooler autentica como `postgres`, que ignora RLS. Sem
 * este `set local role`, uma query pública que esquecesse o filtro de status
 * devolveria rascunho — a policy só protege quem chega pela role certa. O custo
 * é a transação em volta de cada leitura pública, e vale pelo que evita.
 */
export async function queryAsAnon<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role anon`)
    return run(tx)
  })
}
