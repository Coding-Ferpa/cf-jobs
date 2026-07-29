'use client'

import { useQueryStates } from 'nuqs'

import type { Facet, FacetKind } from '@/db/queries/jobs'
import { filtrosDeVagas } from '@/lib/search-params'

/**
 * Filtros como estado de URL. Cada grupo é uma lista de checkboxes com a
 * contagem por opção; marcar qualquer um zera o cursor, senão a pessoa cairia
 * na página 2 de uma busca que não fez.
 *
 * O layout é uma coluna no painel de tela cheia do mobile e 2–3 colunas no
 * popover do desktop (doc 03) — quem posiciona o painel é o JobFiltersPanel.
 */

type ChaveDeLista =
  'tech' | 'role' | 'seniority' | 'work_mode' | 'contract_type' | 'tag' | 'company'

const GRUPOS: { chave: ChaveDeLista; kind: FacetKind; titulo: string }[] = [
  { chave: 'tech', kind: 'technology', titulo: 'Tecnologia' },
  { chave: 'role', kind: 'role', titulo: 'Cargo' },
  { chave: 'seniority', kind: 'seniority', titulo: 'Senioridade' },
  { chave: 'work_mode', kind: 'work_mode', titulo: 'Modalidade' },
  { chave: 'contract_type', kind: 'contract_type', titulo: 'Contratação' },
  { chave: 'tag', kind: 'tag', titulo: 'Tags' },
  { chave: 'company', kind: 'company', titulo: 'Empresa' },
]

const MAXIMO_VISIVEL = 8

export function JobFilters({ facetas }: { facetas: Facet[] }) {
  const [filtros, setFiltros] = useQueryStates(filtrosDeVagas, {
    shallow: false,
    history: 'push',
  })

  function alternar(chave: ChaveDeLista, slug: string, marcado: boolean) {
    const atuais = filtros[chave]
    const proximos = marcado
      ? [...atuais, slug]
      : atuais.filter((valor) => valor !== slug)

    void setFiltros({
      [chave]: proximos.length > 0 ? proximos : null,
      cursor: null,
    })
  }

  return (
    // Colunas em vez de grade: os grupos têm alturas muito diferentes e uma
    // grade deixaria buracos na linha de quem tem menos opções.
    <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
      {GRUPOS.map((grupo) => {
        const opcoes = facetas
          .filter((faceta) => faceta.kind === grupo.kind)
          .slice(0, MAXIMO_VISIVEL)

        if (opcoes.length === 0) return null

        return (
          <fieldset
            className="mb-6 flex break-inside-avoid flex-col gap-2"
            key={grupo.chave}
          >
            <legend className="text-caption mb-1 font-semibold">{grupo.titulo}</legend>
            {opcoes.map((opcao) => {
              const marcado = filtros[grupo.chave].includes(opcao.slug)
              return (
                <label
                  className="text-caption text-muted-foreground flex items-center gap-2"
                  key={opcao.slug}
                >
                  <input
                    checked={marcado}
                    className="accent-primary size-4"
                    onChange={(evento) =>
                      alternar(grupo.chave, opcao.slug, evento.target.checked)
                    }
                    type="checkbox"
                  />
                  <span className="flex-1 truncate">{opcao.label}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {opcao.count}
                  </span>
                </label>
              )
            })}
          </fieldset>
        )
      })}

      {/* Último, como na ordem do doc 03: é o filtro que se mexe menos. */}
      <fieldset className="mb-6 flex break-inside-avoid flex-col gap-2">
        <legend className="text-caption mb-1 font-semibold">Situação</legend>
        <label className="text-caption flex items-center gap-2">
          <input
            checked={filtros.status === 'archived'}
            className="accent-primary size-4"
            onChange={(evento) =>
              void setFiltros({
                status: evento.target.checked ? 'archived' : null,
                cursor: null,
              })
            }
            type="checkbox"
          />
          Mostrar vagas arquivadas
        </label>
      </fieldset>
    </div>
  )
}
