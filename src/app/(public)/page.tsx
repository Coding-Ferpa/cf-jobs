import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import type { SearchParams } from 'nuqs/server'

import { ActiveFilters } from '@/components/jobs/active-filters'
import { JobCard } from '@/components/jobs/job-card'
import { JobFilters } from '@/components/jobs/job-filters'
import { JobSearch } from '@/components/jobs/job-search'
import { getFacets, listJobs, type JobFilters as Filtros } from '@/db/queries/jobs'
import { contarFiltrosAtivos, loadFiltros } from '@/lib/search-params'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

/**
 * A listagem é cacheada por 60s e invalidada pela tag `jobs` (doc 08): publicar
 * uma vaga no admin derruba o cache na hora, e visitante anônimo não paga uma
 * ida ao banco por acesso.
 */
const buscarVagas = unstable_cache(
  async (filtros: Filtros) => {
    const [lista, facetas] = await Promise.all([listJobs(filtros), getFacets(filtros)])
    return { lista, facetas }
  },
  ['vagas-publicas'],
  { revalidate: 60, tags: ['jobs'] },
)

function paginaSeguinte(
  parametros: Record<string, string | string[] | undefined>,
  cursor: string,
): string {
  const query = new URLSearchParams()

  for (const [chave, valor] of Object.entries(parametros)) {
    if (chave === 'cursor' || valor === undefined) continue
    for (const item of Array.isArray(valor) ? valor : [valor]) query.append(chave, item)
  }

  query.set('cursor', cursor)
  return `/?${query.toString()}`
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const parametros = await searchParams
  const filtros = await loadFiltros(parametros)

  const { lista, facetas } = await buscarVagas({
    q: filtros.q,
    tech: filtros.tech,
    role: filtros.role,
    seniority: filtros.seniority,
    workMode: filtros.work_mode,
    contractType: filtros.contract_type,
    tag: filtros.tag,
    company: filtros.company,
    status: filtros.status,
    sort: filtros.sort,
    cursor: filtros.cursor,
  })

  const totalDeFiltros = contarFiltrosAtivos(filtros)
  const hrefSeguinte = lista.nextCursor
    ? paginaSeguinte(
        parametros as Record<string, string | string[] | undefined>,
        lista.nextCursor,
      )
    : null

  return (
    <div className="flex flex-col gap-8 py-10">
      {/* React iça o link para o head: o rastreador segue a paginação. */}
      {hrefSeguinte ? <link href={hrefSeguinte} rel="next" /> : null}

      <section className="flex flex-col items-center gap-5 py-6 text-center">
        <h1 className="sm:text-display max-w-3xl text-[2.25rem] leading-tight font-bold">
          Vagas de tecnologia, direto ao ponto.
        </h1>
        <p className="text-body text-muted-foreground">
          Curadas pela comunidade Coding Ferpa.
        </p>
        <div className="w-full max-w-2xl">
          <JobSearch />
        </div>
      </section>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Desktop: coluna fixa. Mobile: disclosure nativo, sem JS extra. */}
        <aside className="lg:w-[280px] lg:shrink-0">
          <details
            className="border-border rounded-md border p-4 lg:hidden"
            name="filtros"
          >
            <summary className="text-caption cursor-pointer font-semibold">
              Filtrar{totalDeFiltros > 0 ? ` (${totalDeFiltros})` : ''}
            </summary>
            <div className="mt-4">
              <JobFilters facetas={facetas} />
            </div>
          </details>

          <div className="hidden lg:block">
            <h2 className="text-caption mb-4 font-semibold">Filtros</h2>
            <JobFilters facetas={facetas} />
          </div>
        </aside>

        <section
          aria-labelledby="titulo-resultados"
          className="flex min-w-0 flex-1 flex-col gap-5"
        >
          {/* Sem este h2 a hierarquia pula de h1 para o h3 dos cards. */}
          <h2 className="sr-only" id="titulo-resultados">
            Vagas encontradas
          </h2>

          <div className="flex flex-col gap-3">
            <ActiveFilters facetas={facetas} />
            <p aria-live="polite" className="text-caption text-muted-foreground">
              {lista.jobs.length === 0
                ? 'Nenhuma vaga encontrada'
                : `${lista.jobs.length} ${lista.jobs.length === 1 ? 'vaga' : 'vagas'} nesta página`}
            </p>
          </div>

          {lista.jobs.length === 0 ? (
            <div className="border-border rounded-md border border-dashed p-10 text-center">
              <p className="text-body">Nenhuma vaga por aqui… ainda.</p>
              <p className="text-muted-foreground text-caption mt-2">
                Tente remover alguns filtros.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {lista.jobs.map((job) => (
                <li className="flex" key={job.slug}>
                  <div className="flex w-full">
                    <JobCard job={job} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {hrefSeguinte ? (
            <a
              className="border-border hover:border-primary-muted mx-auto rounded-full border px-8 py-2.5 font-semibold transition duration-150"
              href={hrefSeguinte}
              rel="next"
            >
              Carregar mais
            </a>
          ) : null}
        </section>
      </div>
    </div>
  )
}
