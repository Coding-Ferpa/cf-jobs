import type { Metadata } from 'next'
import Link from 'next/link'

import { SuggestionActions } from '@/components/admin/suggestion-actions'
import { Badge } from '@/components/ui/badge'
import { listarSugestoes, taxonomiasDoTipo } from '@/db/queries/suggestions'
import { requireRole } from '@/lib/auth'
import { ROTULO_DO_KIND } from '@/lib/taxonomy-kinds'

export const metadata: Metadata = { title: 'Sugestões de taxonomia' }

/**
 * A fila de revisão humana (doc 05). Aqui o cadastro cresce — e é o único
 * lugar onde ele cresce a partir do que a IA leu.
 *
 * Papel mínimo é moderador, como na matriz do doc 04: moderar o vocabulário
 * não exige poder editar vaga.
 */
export default async function SugestoesPage() {
  await requireRole('moderator')

  const sugestoes = await listarSugestoes('pending')

  const tipos = [...new Set(sugestoes.map((sugestao) => sugestao.kind))]
  const destinos = Object.fromEntries(
    await Promise.all(
      tipos.map(async (tipo) => [tipo, await taxonomiasDoTipo(tipo)] as const),
    ),
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          className="text-caption text-muted-foreground hover:text-foreground transition duration-150"
          href="/admin/taxonomias"
        >
          ← Taxonomias
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h2 font-bold">Sugestões</h1>
          <Badge variant="outline">{sugestoes.length} pendentes</Badge>
        </div>
        <p className="text-muted-foreground text-caption">
          Termos que a IA encontrou nas vagas e o cadastro não conhece.{' '}
          <strong>Mesclar</strong> guarda o termo como alias da taxonomia escolhida — é
          assim que a próxima importação acerta sozinha.
        </p>
      </header>

      {sugestoes.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed px-6 py-12 text-center">
          Nada pendente. A fila enche sozinha conforme as importações rodam.
        </p>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="fila-de-sugestoes">
          {sugestoes.map((sugestao) => (
            <li
              className="border-border flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-start lg:justify-between"
              data-testid="sugestao"
              key={sugestao.id}
            >
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{sugestao.suggestedLabel}</span>
                  <Badge variant="outline">
                    {ROTULO_DO_KIND[sugestao.kind] ?? sugestao.kind}
                  </Badge>
                  <code className="text-muted-foreground text-xs">
                    {sugestao.normalizedSlug}
                  </code>
                </div>

                {sugestao.context ? (
                  <p className="text-muted-foreground border-border border-l-2 pl-3 text-sm italic">
                    {sugestao.context}
                  </p>
                ) : null}

                {sugestao.jobId ? (
                  <p className="text-caption text-muted-foreground">
                    Veio de{' '}
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      href={`/admin/vagas/${sugestao.jobId}/revisar`}
                    >
                      {sugestao.jobTitle}
                    </Link>
                    {sugestao.companyName ? ` — ${sugestao.companyName}` : null}
                  </p>
                ) : null}
              </div>

              <div className="w-full shrink-0 lg:max-w-xs">
                <SuggestionActions
                  destinos={destinos[sugestao.kind] ?? []}
                  kind={sugestao.kind}
                  rotulo={sugestao.suggestedLabel}
                  sugestaoId={sugestao.id}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
