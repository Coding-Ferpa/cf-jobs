import 'server-only'

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
