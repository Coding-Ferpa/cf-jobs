'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { arquivarVaga, excluirVaga, publicarVaga, restaurarVaga } from '@/actions/jobs'
import type { ActionResult } from '@/actions/result'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { hasRole, type UserRole } from '@/lib/roles'

import { ActionFeedback } from './action-feedback'

/**
 * Ações rápidas de cada linha da tabela (doc 08). O que muda status fica em
 * botão direto; excluir passa por confirmação porque não tem volta.
 */

type Status = 'draft' | 'pending_review' | 'published' | 'archived' | 'rejected'

export function JobRowActions({
  id,
  titulo,
  status,
  papel,
}: {
  id: string
  titulo: string
  status: Status
  papel: UserRole
}) {
  const router = useRouter()
  const [pendente, iniciarTransicao] = useTransition()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  const podeEditar = hasRole(papel, 'editor')
  const podeExcluir = hasRole(papel, 'admin') && ['draft', 'rejected'].includes(status)

  function executar(
    action: (entrada: { id: string; expiresAt: null }) => Promise<ActionResult<unknown>>,
  ) {
    iniciarTransicao(async () => {
      const resposta = await action({ id, expiresAt: null })
      setResultado(resposta)
      // Sem refresh a linha continuaria mostrando o status antigo.
      if (resposta.ok) router.refresh()
    })
  }

  if (!podeEditar) return null

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {status !== 'published' ? (
          <Button
            disabled={pendente}
            onClick={() => executar(publicarVaga)}
            size="sm"
            variant="outline"
          >
            Publicar
          </Button>
        ) : (
          <Button
            disabled={pendente}
            onClick={() => executar(arquivarVaga)}
            size="sm"
            variant="outline"
          >
            Arquivar
          </Button>
        )}

        {/* Vale também para publicada: despublicar é o caminho para corrigir
            uma vaga que subiu errada, e a action já aceita essa transição. */}
        {status !== 'draft' ? (
          <Button
            disabled={pendente}
            onClick={() => executar(restaurarVaga)}
            size="sm"
            variant="ghost"
          >
            Voltar a rascunho
          </Button>
        ) : null}

        {podeExcluir ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={pendente} size="sm" variant="ghost">
                Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir “{titulo}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  A vaga sai do banco e não dá para desfazer. Se ela já esteve publicada,
                  prefira arquivar — a URL continua valendo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    iniciarTransicao(async () => {
                      const resposta = await excluirVaga({ id })
                      setResultado(resposta)
                      if (resposta.ok) router.refresh()
                    })
                  }
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      <ActionFeedback resultado={resultado} />
    </div>
  )
}
