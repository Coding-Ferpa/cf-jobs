'use client'

import { useQueryStates } from 'nuqs'

import type { Facet } from '@/db/queries/jobs'
import { filtrosDeVagas } from '@/lib/search-params'

type ChaveDeLista =
  'tech' | 'role' | 'seniority' | 'work_mode' | 'contract_type' | 'tag' | 'company'

const CHAVES: ChaveDeLista[] = [
  'tech',
  'role',
  'seniority',
  'work_mode',
  'contract_type',
  'tag',
  'company',
]

/** Chips do que está filtrando agora, cada um removível (doc 03). */
export function ActiveFilters({ facetas }: { facetas: Facet[] }) {
  const [filtros, setFiltros] = useQueryStates(filtrosDeVagas, {
    shallow: false,
    history: 'push',
  })

  const rotuloDe = (slug: string) =>
    facetas.find((faceta) => faceta.slug === slug)?.label ?? slug

  const ativos = CHAVES.flatMap((chave) =>
    filtros[chave].map((slug) => ({ chave, slug })),
  )

  const mostrandoArquivadas = filtros.status !== 'published'

  if (ativos.length === 0 && !mostrandoArquivadas && !filtros.q) return null

  function remover(chave: ChaveDeLista, slug: string) {
    const proximos = filtros[chave].filter((valor) => valor !== slug)
    void setFiltros({ [chave]: proximos.length > 0 ? proximos : null, cursor: null })
  }

  function limparTudo() {
    void setFiltros({
      q: null,
      tech: null,
      role: null,
      seniority: null,
      work_mode: null,
      contract_type: null,
      tag: null,
      company: null,
      status: null,
      cursor: null,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filtros.q ? (
        <span className="bg-surface text-caption rounded-full px-3 py-1">
          busca: {filtros.q}
        </span>
      ) : null}

      {mostrandoArquivadas ? (
        <span className="bg-surface text-caption rounded-full px-3 py-1">
          {filtros.status === 'archived' ? 'arquivadas' : 'todas as situações'}
        </span>
      ) : null}

      {ativos.map(({ chave, slug }) => (
        <button
          className="bg-surface hover:border-primary-muted text-caption flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1 transition duration-150"
          key={`${chave}:${slug}`}
          onClick={() => remover(chave, slug)}
          type="button"
        >
          {rotuloDe(slug)}
          <span aria-hidden="true">×</span>
          <span className="sr-only">remover filtro</span>
        </button>
      ))}

      <button
        className="text-caption text-muted-foreground hover:text-foreground underline transition duration-150"
        onClick={limparTudo}
        type="button"
      >
        Limpar tudo
      </button>
    </div>
  )
}
