/**
 * Exercita as queries públicas contra o banco local. Não é teste automatizado:
 * é a checagem manual de que o SQL escrito à mão devolve o que o app espera.
 *
 * Uso: `pnpm check:queries` com o Supabase local no ar.
 */
import { sql } from 'drizzle-orm'

import { db, queryAsAnon } from '../src/db/client'
import {
  getFacets,
  getJobBySlug,
  listJobs,
  listSimilarJobs,
} from '../src/db/queries/jobs'

/**
 * O ponto central: `queryAsAnon` precisa esconder rascunho mesmo numa query sem
 * filtro de status. É o que prova que a RLS está valendo, e não só o WHERE.
 */
async function conferirRls() {
  await db.execute(sql`
    insert into public.jobs (slug, title, company_id, description_md, source_url,
                             source_url_hash, apply_url, status)
    select 'rascunho-de-teste', 'Rascunho de Teste', id, '#', 'https://x.test',
           'hash-rascunho-de-teste', 'https://x.test', 'draft'
      from public.companies limit 1
    on conflict (source_url_hash) do nothing
  `)

  const comoPostgres = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from public.jobs`,
  )
  const comoAnon = await queryAsAnon(async (tx) =>
    tx.execute<{ total: number }>(sql`select count(*)::int as total from public.jobs`),
  )

  const totalPostgres = (comoPostgres as unknown as { total: number }[])[0]?.total ?? 0
  const totalAnon = (comoAnon as unknown as { total: number }[])[0]?.total ?? 0

  console.log(
    'rls aplica:',
    totalAnon < totalPostgres,
    `(postgres ve ${totalPostgres}, anon ve ${totalAnon})`,
  )

  await db.execute(sql`delete from public.jobs where slug = 'rascunho-de-teste'`)
}

async function main() {
  await conferirRls()

  const primeiraPagina = await listJobs({ limit: 5 })
  console.log('publicadas na 1a pagina:', primeiraPagina.jobs.length)
  console.log('tem mais:', primeiraPagina.hasMore)
  console.log(
    'primeira:',
    primeiraPagina.jobs[0]?.title,
    '|',
    primeiraPagina.jobs[0]?.company.name,
  )
  console.log(
    'tecnologias da primeira:',
    primeiraPagina.jobs[0]?.technologies.map((t) => t.slug).join(', '),
  )

  const segundaPagina = await listJobs({ limit: 5, cursor: primeiraPagina.nextCursor })
  const slugsPrimeira = new Set(primeiraPagina.jobs.map((j) => j.slug))
  const repetidas = segundaPagina.jobs.filter((j) => slugsPrimeira.has(j.slug))
  console.log('2a pagina:', segundaPagina.jobs.length, '| repetidas:', repetidas.length)

  const remotasPlenas = await listJobs({ workMode: ['remoto'], seniority: ['pleno'] })
  console.log('remoto + pleno:', remotasPlenas.jobs.length)

  const comDuasTech = await listJobs({ tech: ['kubernetes', 'terraform'] })
  console.log('kubernetes E terraform:', comDuasTech.jobs.map((j) => j.slug).join(', '))

  const busca = await listJobs({ q: 'react' })
  console.log('busca "react":', busca.jobs.map((j) => j.title).join(' | '))

  const arquivadas = await listJobs({ status: 'archived' })
  console.log('arquivadas:', arquivadas.jobs.length)

  const publicadas = await listJobs({ limit: 50 })
  console.log(
    'rascunho vazou?',
    publicadas.jobs.some((j) => j.status !== 'published'),
  )

  const facetas = await getFacets({})
  const porTipo = facetas.reduce<Record<string, number>>((acc, f) => {
    acc[f.kind] = (acc[f.kind] ?? 0) + 1
    return acc
  }, {})
  console.log('facetas por tipo:', JSON.stringify(porTipo))

  const detalhe = await getJobBySlug('sre-aurora-pagamentos-f6a7b8')
  console.log(
    'detalhe:',
    detalhe?.title,
    '| markdown:',
    detalhe?.descriptionMd.slice(0, 24),
  )

  const semelhantes = await listSimilarJobs('sre-aurora-pagamentos-f6a7b8')
  console.log('semelhantes:', semelhantes.map((j) => j.slug).join(', '))

  const inexistente = await getJobBySlug('nao-existe')
  console.log('slug inexistente devolve null:', inexistente === null)

  process.exit(0)
}

void main()
