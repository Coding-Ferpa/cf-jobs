'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { aprovarSugestao, mesclarSugestao, rejeitarSugestao } from '@/actions/suggestions'
import type { ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KINDS_DE_TECNOLOGIA } from '@/lib/schemas/admin'

/**
 * Aprovar, mesclar ou rejeitar uma sugestão (doc 05).
 *
 * As três aparecem juntas de propósito: mesclar é a opção que ensina o sistema
 * (o termo vira alias), e escondê-la atrás de outro clique faria de rejeitar o
 * caminho fácil — que é o que menos serve à qualidade do cadastro.
 */

const ROTULO_DO_KIND_DE_TECNOLOGIA: Record<(typeof KINDS_DE_TECNOLOGIA)[number], string> =
  {
    language: 'Linguagem',
    framework: 'Framework',
    database: 'Banco de dados',
    cloud: 'Cloud',
    tool: 'Ferramenta',
  }

export function SuggestionActions({
  sugestaoId,
  kind,
  rotulo,
  destinos,
}: {
  sugestaoId: string
  kind: string
  rotulo: string
  destinos: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)
  const [destino, setDestino] = useState<string>('')
  const [tipo, setTipo] = useState<(typeof KINDS_DE_TECNOLOGIA)[number]>('tool')

  function executar(acao: () => Promise<ActionResult<unknown>>) {
    iniciar(async () => {
      const resposta = await acao()
      setResultado(resposta)
      if (resposta.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {kind === 'technology' ? (
        <Select onValueChange={(valor) => setTipo(valor as typeof tipo)} value={tipo}>
          <SelectTrigger aria-label={`Tipo de ${rotulo}`} className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS_DE_TECNOLOGIA.map((item) => (
              <SelectItem key={item} value={item}>
                {ROTULO_DO_KIND_DE_TECNOLOGIA[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={pendente}
          onClick={() =>
            executar(() =>
              aprovarSugestao({
                id: sugestaoId,
                ...(kind === 'technology' ? { technologyKind: tipo } : {}),
              }),
            )
          }
          size="sm"
        >
          Aprovar
        </Button>

        <Button
          disabled={pendente}
          onClick={() => executar(() => rejeitarSugestao({ id: sugestaoId }))}
          size="sm"
          variant="ghost"
        >
          Rejeitar
        </Button>
      </div>

      {destinos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={setDestino} value={destino}>
            <SelectTrigger aria-label={`Mesclar ${rotulo} em`} className="h-9 flex-1">
              <SelectValue placeholder="Mesclar em…" />
            </SelectTrigger>
            <SelectContent>
              {destinos.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            disabled={pendente || destino === ''}
            onClick={() =>
              executar(() => mesclarSugestao({ id: sugestaoId, taxonomyId: destino }))
            }
            size="sm"
            variant="outline"
          >
            Mesclar
          </Button>
        </div>
      ) : null}

      <ActionFeedback resultado={resultado} />
    </div>
  )
}
