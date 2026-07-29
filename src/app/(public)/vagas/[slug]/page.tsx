import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { JobCard } from '@/components/jobs/job-card'
import { JobMarkdown } from '@/components/jobs/job-markdown'
import { JobShare } from '@/components/jobs/job-share'
import { getJobBySlug, listSimilarJobs } from '@/db/queries/jobs'
import { clientEnv } from '@/lib/env'
import { formatarData, formatarLocalizacao, formatarSalario } from '@/lib/format'
import { breadcrumbJsonLd, jobPostingJsonLd, tituloDaVaga } from '@/lib/seo'

/** Página de vaga é cacheada por 1h e invalidada pela tag da própria vaga. */
const buscarVaga = unstable_cache(
  async (slug: string) => {
    const vaga = await getJobBySlug(slug)
    if (!vaga) return null
    const semelhantes = await listSimilarJobs(slug)
    return { vaga, semelhantes }
  },
  ['vaga-publica'],
  { revalidate: 3600, tags: ['jobs'] },
)

function Resumo({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-subtle-foreground text-xs">{termo}</dt>
      <dd className="text-caption">{valor}</dd>
    </div>
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const resultado = await buscarVaga(slug)

  if (!resultado) return { title: 'Vaga não encontrada' }

  const { vaga } = resultado
  const caminho = `/vagas/${vaga.slug}`

  return {
    title: tituloDaVaga(vaga),
    description: vaga.summary ?? undefined,
    alternates: { canonical: caminho },
    openGraph: {
      type: 'article',
      title: tituloDaVaga(vaga),
      description: vaga.summary ?? undefined,
      url: caminho,
      publishedTime: vaga.publishedAt ?? undefined,
    },
  }
}

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const resultado = await buscarVaga(slug)

  if (!resultado) notFound()

  const { vaga, semelhantes } = resultado
  const arquivada = vaga.status === 'archived'
  const url = `${clientEnv().NEXT_PUBLIC_SITE_URL}/vagas/${vaga.slug}`
  const salario = formatarSalario(vaga.salary)
  const localizacao = formatarLocalizacao(vaga.location, vaga.workMode?.slug)

  return (
    <article className="flex flex-col gap-8 py-8">
      {/* Dados estruturados do doc 08: é o que habilita o Google for Jobs. */}
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jobPostingJsonLd(vaga, url)),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd(vaga, url, clientEnv().NEXT_PUBLIC_SITE_URL),
          ),
        }}
        type="application/ld+json"
      />

      <nav aria-label="Trilha de navegação">
        <ol className="text-caption text-muted-foreground flex flex-wrap gap-2">
          <li>
            <Link className="hover:text-foreground transition duration-150" href="/">
              Início
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link className="hover:text-foreground transition duration-150" href="/">
              Vagas
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground truncate">
            {vaga.title}
          </li>
        </ol>
      </nav>

      {arquivada ? (
        <p
          className="text-warning border-warning text-caption rounded-md border px-4 py-3"
          role="status"
        >
          Esta vaga expirou
          {vaga.expiresAt ? ` em ${formatarData(vaga.expiresAt)}` : ''} e não recebe mais
          candidaturas. Veja as{' '}
          <Link className="underline" href="/">
            vagas abertas
          </Link>
          .
        </p>
      ) : null}

      <div className="flex flex-col gap-10 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="flex flex-col gap-3">
            <p className="text-muted-foreground">{vaga.company.name}</p>
            <h1 className="text-h2 font-bold">{vaga.title}</h1>

            <ul className="text-caption text-muted-foreground flex flex-wrap gap-2">
              {[
                localizacao,
                vaga.workMode?.label,
                vaga.seniority?.label,
                vaga.contractType?.label,
              ]
                .filter((item): item is string => Boolean(item))
                .map((item) => (
                  <li className="bg-surface rounded-full px-3 py-1" key={item}>
                    {item}
                  </li>
                ))}
            </ul>

            {vaga.technologies.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {vaga.technologies.map((tecnologia) => (
                  <li
                    className="bg-surface text-muted-foreground rounded-full px-2.5 py-1 font-mono text-xs"
                    key={tecnologia.slug}
                  >
                    {tecnologia.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </header>

          <JobMarkdown conteudo={vaga.descriptionMd} />
        </div>

        <aside className="flex flex-col gap-6 lg:w-[300px] lg:shrink-0">
          {arquivada ? (
            <p className="border-border text-muted-foreground text-caption rounded-full border px-6 py-2.5 text-center">
              Candidaturas encerradas
            </p>
          ) : (
            <a
              className="bg-primary-solid hover:shadow-glow rounded-full px-6 py-3 text-center font-semibold text-white transition duration-150"
              href={vaga.applyUrl}
              rel="noopener nofollow"
              target="_blank"
            >
              Candidatar-se
            </a>
          )}

          <dl className="border-border flex flex-col gap-3 rounded-md border p-4">
            {salario ? <Resumo termo="Faixa salarial" valor={salario} /> : null}
            {vaga.workMode ? (
              <Resumo termo="Modalidade" valor={vaga.workMode.label} />
            ) : null}
            {vaga.seniority ? (
              <Resumo termo="Senioridade" valor={vaga.seniority.label} />
            ) : null}
            {vaga.contractType ? (
              <Resumo termo="Contratação" valor={vaga.contractType.label} />
            ) : null}
            {localizacao ? <Resumo termo="Local" valor={localizacao} /> : null}
            {vaga.publishedAt ? (
              <Resumo termo="Publicada em" valor={formatarData(vaga.publishedAt)} />
            ) : null}
            {vaga.expiresAt && !arquivada ? (
              <Resumo termo="Expira em" valor={formatarData(vaga.expiresAt)} />
            ) : null}
          </dl>

          <JobShare titulo={vaga.title} url={url} />

          <p className="text-subtle-foreground text-xs">
            Publicada originalmente em{' '}
            <a
              className="underline"
              href={vaga.sourceUrl}
              rel="noopener nofollow"
              target="_blank"
            >
              {new URL(vaga.sourceUrl).hostname}
            </a>
          </p>
        </aside>
      </div>

      {semelhantes.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-h3 font-semibold">Vagas semelhantes</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {semelhantes.map((semelhante) => (
              <li className="flex" key={semelhante.slug}>
                <div className="flex w-full">
                  <JobCard job={semelhante} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}
