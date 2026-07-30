import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/db/client'

/**
 * O aviso de revalidação (ADR-0018) contra o banco de verdade.
 *
 * Este caminho nunca tinha sido exercido em ambiente nenhum: a função é no-op
 * sem configuração, e sem produção ninguém a configurava. Foi assim que um
 * mecanismo que **não funciona no Supabase** (`alter database ... set app.*`,
 * que exige superusuário) sobreviveu do M1 até a ida ao ar.
 *
 * A asserção é sobre a fila do pg_net: `net.http_post` não faz a requisição na
 * hora, ele enfileira. Conferir a fila é conferir que a função decidiu chamar —
 * sem depender de um servidor de verdade do outro lado.
 */

const URL_DE_TESTE = 'https://revalidate.test/api/internal/revalidate'

async function limparSegredos() {
  await db.execute(sql`
    delete from vault.secrets
     where name in ('cfjobs_revalidate_url', 'cfjobs_cron_secret')
  `)
}

async function tamanhoDaFila(): Promise<number> {
  const linhas = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from net.http_request_queue`,
  )
  return (linhas as unknown as { n: number }[])[0]?.n ?? 0
}

afterAll(async () => {
  await limparSegredos()
})

describe('notify_revalidate', () => {
  it('não chama ninguém sem os dois segredos', async () => {
    await limparSegredos()

    const antes = await tamanhoDaFila()
    await db.execute(sql`select public.notify_revalidate()`)

    // É o comportamento de local e do CI: nenhuma rede, nenhum erro.
    expect(await tamanhoDaFila()).toBe(antes)
  })

  it('também não chama com apenas um dos dois', async () => {
    await limparSegredos()
    await db.execute(
      sql`select vault.create_secret(${URL_DE_TESTE}, 'cfjobs_revalidate_url')`,
    )

    const antes = await tamanhoDaFila()
    await db.execute(sql`select public.notify_revalidate()`)

    // URL sem segredo seria uma requisição sem autenticação — o endpoint a
    // recusaria, e o log encheria de 401 que ninguém entende.
    expect(await tamanhoDaFila()).toBe(antes)
  })

  it('enfileira a requisição quando os dois estão no Vault', async () => {
    await limparSegredos()
    await db.execute(
      sql`select vault.create_secret(${URL_DE_TESTE}, 'cfjobs_revalidate_url')`,
    )
    await db.execute(
      sql`select vault.create_secret('segredo-de-teste', 'cfjobs_cron_secret')`,
    )

    await db.execute(sql`select public.notify_revalidate()`)

    const linhas = await db.execute<{ url: string; headers: Record<string, string> }>(sql`
      select url, headers
        from net.http_request_queue
       where url = ${URL_DE_TESTE}
       order by id desc
       limit 1
    `)

    const pedido = (
      linhas as unknown as { url: string; headers: Record<string, string> }[]
    ).at(0)

    expect(pedido?.url).toBe(URL_DE_TESTE)
    // O endpoint autentica por bearer (doc 06): sem o cabeçalho a chamada é
    // inútil, e é justamente o que o Vault passou a guardar.
    expect(pedido?.headers?.['Authorization']).toBe('Bearer segredo-de-teste')
  })
})
