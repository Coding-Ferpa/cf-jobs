import { CircleAlert, ExternalLink, Info } from 'lucide-react'
import Link from 'next/link'

import { SuggestionActions } from '@/components/admin/suggestion-actions'
import { Badge } from '@/components/ui/badge'
import type { SugestaoPendente } from '@/db/queries/suggestions'
import { ROTULO_DO_KIND } from '@/lib/taxonomy-kinds'
import type { ConferenciaDaRevisao } from '@/features/import/review'
import { cn } from '@/lib/cn'

/**
 * Painel lateral da tela de revisão (doc 08): de onde a vaga veio, o que a IA
 * não conseguiu resolver e as sugestões pendentes desta vaga.
 *
 * A ordem é a da decisão de quem revisa: primeiro a origem (dá para conferir
 * no anúncio), depois o que precisa de atenção, por último o que só ela pode
 * resolver.
 */

const CLASSE_DA_SITUACAO = {
  nao_cadastrado: 'border-warning text-warning',
  parcial: 'border-warning text-warning',
  ausente: 'border-border text-muted-foreground',
} as const

function corDaConfianca(confianca: number): string {
  if (confianca >= 0.8) return 'border-success text-success'
  if (confianca >= 0.5) return 'border-warning text-warning'
  return 'border-destructive text-destructive'
}

export function ReviewPanel({
  conferencia,
  importacao,
  sugestoes,
  destinos,
}: {
  conferencia: ConferenciaDaRevisao
  importacao: {
    url: string
    sourceSite: string | null
    model: string | null
    tokensIn: number | null
    tokensOut: number | null
    latencyMs: number | null
    attempt: number
  } | null
  sugestoes: SugestaoPendente[]
  destinos: Record<string, { id: string; label: string }[]>
}) {
  return (
    <aside
      className="flex w-full flex-col gap-6 lg:max-w-sm"
      aria-label="Revisão da importação"
    >
      {conferencia.baixaConfianca ? (
        <div
          className="border-destructive text-destructive flex items-start gap-3 rounded-md border px-4 py-3"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">Confiança baixa</p>
            <p className="text-caption">
              A IA sinalizou que a extração ficou incerta. Confira todos os campos contra
              o anúncio antes de publicar.
            </p>
          </div>
        </div>
      ) : null}

      <section className="border-border flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-caption font-semibold">Origem</h2>

        {importacao ? (
          <>
            <Link
              className="text-primary text-caption inline-flex items-start gap-1.5 break-all underline-offset-4 hover:underline"
              href={importacao.url}
              rel="noopener nofollow"
              target="_blank"
            >
              {importacao.url}
              <ExternalLink aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            </Link>

            <dl className="text-caption grid grid-cols-2 gap-y-2">
              <dt className="text-muted-foreground">Adapter</dt>
              <dd>{importacao.sourceSite ?? '—'}</dd>

              <dt className="text-muted-foreground">Modelo</dt>
              <dd className="break-all">{importacao.model ?? '—'}</dd>

              <dt className="text-muted-foreground">Tokens</dt>
              <dd>
                {importacao.tokensIn ?? 0} entrada / {importacao.tokensOut ?? 0} saída
              </dd>

              <dt className="text-muted-foreground">Tempo</dt>
              <dd>
                {importacao.latencyMs
                  ? `${(importacao.latencyMs / 1000).toFixed(1)}s`
                  : '—'}
              </dd>

              {conferencia.confianca !== null ? (
                <>
                  <dt className="text-muted-foreground">Confiança</dt>
                  <dd>
                    <Badge
                      className={corDaConfianca(conferencia.confianca)}
                      variant="outline"
                    >
                      {Math.round(conferencia.confianca * 100)}%
                    </Badge>
                  </dd>
                </>
              ) : null}

              {importacao.attempt > 1 ? (
                <>
                  <dt className="text-muted-foreground">Tentativa</dt>
                  <dd>{importacao.attempt}ª</dd>
                </>
              ) : null}
            </dl>
          </>
        ) : (
          <p className="text-muted-foreground text-caption">
            Esta vaga foi cadastrada à mão, sem importação.
          </p>
        )}
      </section>

      {conferencia.divergencias.length > 0 ? (
        <section className="border-border flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-caption font-semibold">Precisa da sua atenção</h2>

          <ul className="flex flex-col gap-3">
            {conferencia.divergencias.map((divergencia) => (
              <li className="flex flex-col gap-1" key={divergencia.campo}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-caption font-medium">{divergencia.rotulo}</span>
                  <Badge
                    className={cn('text-xs', CLASSE_DA_SITUACAO[divergencia.situacao])}
                    variant="outline"
                  >
                    {divergencia.situacao === 'ausente'
                      ? 'não informado'
                      : divergencia.situacao === 'parcial'
                        ? 'parcial'
                        : 'fora do cadastro'}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">{divergencia.explicacao}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-muted-foreground text-caption flex items-start gap-2">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Todos os campos que a IA extraiu casaram com o cadastro.
        </p>
      )}

      {sugestoes.length > 0 ? (
        <section className="border-border flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-caption font-semibold">Sugestões desta vaga</h2>
            <p className="text-muted-foreground text-xs">
              Termos que a IA encontrou e o cadastro não conhece. Mesclar ensina o
              sistema: o termo vira alias e a próxima vaga resolve sozinha.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            {sugestoes.map((sugestao) => (
              <li className="flex flex-col gap-2" key={sugestao.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-caption font-medium">
                    {sugestao.suggestedLabel}
                  </span>
                  <Badge className="text-xs" variant="outline">
                    {ROTULO_DO_KIND[sugestao.kind] ?? sugestao.kind}
                  </Badge>
                </div>

                {sugestao.context ? (
                  <p className="text-muted-foreground border-border border-l-2 pl-3 text-xs italic">
                    {sugestao.context}
                  </p>
                ) : null}

                <SuggestionActions
                  destinos={destinos[sugestao.kind] ?? []}
                  kind={sugestao.kind}
                  rotulo={sugestao.suggestedLabel}
                  sugestaoId={sugestao.id}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  )
}
