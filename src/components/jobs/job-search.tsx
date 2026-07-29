'use client'

import { useQueryStates } from 'nuqs'
import { useEffect, useRef, useState } from 'react'

import { filtrosDeVagas } from '@/lib/search-params'

const DEBOUNCE_MS = 300

export function JobSearch() {
  const [{ q }, setFiltros] = useQueryStates(filtrosDeVagas, {
    shallow: false,
    history: 'replace',
  })
  const [texto, setTexto] = useState(q)
  const primeiraRenderizacao = useRef(true)

  useEffect(() => {
    // Não dispara navegação no mount, só quando a pessoa digita.
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false
      return
    }

    const tempo = setTimeout(() => {
      // Buscar recomeça a paginação: manter o cursor mostraria a página 2 de
      // outra busca.
      void setFiltros({ q: texto || null, cursor: null })
    }, DEBOUNCE_MS)

    return () => clearTimeout(tempo)
  }, [texto, setFiltros])

  return (
    <search className="relative min-w-0 flex-1">
      <label className="sr-only" htmlFor="busca">
        Buscar vagas
      </label>
      <svg
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        autoComplete="off"
        className="border-border bg-surface text-body focus-visible:border-primary w-full rounded-full border py-3 pr-6 pl-12 transition duration-150"
        id="busca"
        name="q"
        onChange={(evento) => setTexto(evento.target.value)}
        placeholder="Busque por cargo, tecnologia ou empresa…"
        type="search"
        value={texto}
      />
    </search>
  )
}
