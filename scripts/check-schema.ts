/**
 * Confere se o schema Drizzle continua espelhando o banco.
 *
 * As migrations são SQL manual (doc 04) e o schema TypeScript é escrito à mão
 * ao lado delas — sem uma checagem, as duas descrevem realidades diferentes e o
 * erro só aparece em runtime. Aqui cada tabela e view é consultada com a lista
 * de colunas que o Drizzle conhece: coluna que não existe derruba o script.
 *
 * Precisa de um banco com as migrations aplicadas (`pnpm db:reset`).
 */
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { PgTable } from 'drizzle-orm/pg-core'
import postgres from 'postgres'

import * as schema from '../src/db/schema'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('✖ DATABASE_URL não definida. Suba o banco com `pnpm db:start`.')
  process.exit(1)
}

function isQueryable(value: unknown): value is PgTable {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getOwnPropertySymbols(value).some((symbol) =>
      symbol.description?.startsWith('drizzle:'),
    )
  )
}

async function main(): Promise<void> {
  const client = postgres(DATABASE_URL as string, { prepare: false, max: 1 })
  const db = drizzle(client)

  const entities = Object.entries(schema).filter(([, value]) => isQueryable(value))
  const failures: string[] = []

  for (const [name, entity] of entities) {
    try {
      await db
        .select()
        .from(entity as PgTable)
        .where(sql`false`)
    } catch (error) {
      failures.push(`  - ${name}: ${(error as Error).message}`)
    }
  }

  await client.end()

  if (failures.length > 0) {
    console.error('✖ O schema Drizzle divergiu do banco:\n')
    for (const failure of failures) console.error(failure)
    console.error('\nAtualize src/db/schema/* ou a migration correspondente.')
    process.exit(1)
  }

  console.log(`✔ Schema Drizzle em sincronia (${entities.length} tabelas e views).`)
}

void main()
