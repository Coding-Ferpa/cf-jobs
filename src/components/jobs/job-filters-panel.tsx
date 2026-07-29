'use client'

import { useQueryStates } from 'nuqs'
import { useCallback, useEffect, useRef } from 'react'

import { JobFilters } from '@/components/jobs/job-filters'
import type { Facet } from '@/db/queries/jobs'
import { contarFiltrosAtivos, filtrosDeVagas } from '@/lib/search-params'

/**
 * Botão "Filtros" à direita da busca, com o painel atrás dele (doc 03,
 * revisado): popover ancorado no desktop, tela cheia no mobile.
 *
 * A base é `<details>` nativo, que já dá `aria-expanded`, alternância por
 * teclado e funciona sem JS. O JS acrescenta o que o elemento não tem —
 * fechar com Esc, fechar ao clicar fora e mover o foco — sem virar requisito.
 */
export function JobFiltersPanel({ facetas }: { facetas: Facet[] }) {
  const [filtros] = useQueryStates(filtrosDeVagas)
  const total = contarFiltrosAtivos(filtros)

  const detalhes = useRef<HTMLDetailsElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLElement>(null)

  const fechar = useCallback(() => {
    const elemento = detalhes.current
    if (!elemento?.open) return
    elemento.open = false
    botao.current?.focus()
  }, [])

  useEffect(() => {
    const elemento = detalhes.current
    if (!elemento) return

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') fechar()
    }

    // `pointerdown` em vez de `click`: fecha antes de a página reagir ao alvo.
    function aoApontar(evento: PointerEvent) {
      const alvo = evento.target
      if (alvo instanceof Node && !elemento?.contains(alvo)) fechar()
    }

    function aoAlternar() {
      if (elemento?.open) painel.current?.focus()
    }

    elemento.addEventListener('toggle', aoAlternar)
    document.addEventListener('keydown', aoTeclar)
    document.addEventListener('pointerdown', aoApontar)

    return () => {
      elemento.removeEventListener('toggle', aoAlternar)
      document.removeEventListener('keydown', aoTeclar)
      document.removeEventListener('pointerdown', aoApontar)
    }
  }, [fechar])

  return (
    <details className="relative shrink-0" ref={detalhes}>
      <summary
        className="border-border bg-surface hover:border-primary-muted flex h-full cursor-pointer list-none items-center gap-2 rounded-full border px-4 py-3 font-semibold transition duration-150 sm:px-5 [&::-webkit-details-marker]:hidden"
        ref={botao}
      >
        <svg
          aria-hidden="true"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M3 5h18l-7 8v5l-4 2v-7z" />
        </svg>
        {/* Abaixo de `sm` o rótulo sai: com ele, a barra de busca encolhe a
            ponto de cortar o placeholder em "Busque por ca…". O funil e o
            badge continuam visíveis e o nome acessível não muda. */}
        <span className="max-sm:sr-only">Filtros</span>
        {total > 0 ? (
          <>
            <span
              aria-hidden="true"
              className="bg-primary-solid text-caption rounded-full px-2 font-mono text-white"
            >
              {total}
            </span>
            {/* O número sozinho não diz nada em leitor de tela. */}
            <span className="sr-only">
              ({total} {total === 1 ? 'ativo' : 'ativos'})
            </span>
          </>
        ) : null}
      </summary>

      <div
        className="bg-card border-border fixed inset-0 z-50 flex flex-col text-left sm:absolute sm:inset-auto sm:top-[calc(100%+0.5rem)] sm:right-0 sm:z-40 sm:max-h-[min(28rem,60vh)] sm:w-[min(46rem,calc(100vw-3rem))] sm:rounded-md sm:border sm:shadow-lg"
        ref={painel}
        tabIndex={-1}
      >
        {/* No mobile o painel cobre a página inteira: precisa do próprio
            cabeçalho, porque o botão que abriu fica atrás dele. */}
        <div className="border-border flex items-center justify-between border-b px-6 py-4 sm:hidden">
          <h2 className="font-semibold">Filtros</h2>
          <button
            className="border-border hover:border-primary-muted text-caption rounded-full border px-4 py-1.5 transition duration-150"
            onClick={fechar}
            type="button"
          >
            Fechar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-6">
          <JobFilters facetas={facetas} />
        </div>

        <div className="border-border border-t p-4 sm:hidden">
          <button
            className="bg-primary-solid w-full rounded-full py-2.5 font-semibold text-white transition duration-150"
            onClick={fechar}
            type="button"
          >
            Ver vagas
          </button>
        </div>
      </div>
    </details>
  )
}
