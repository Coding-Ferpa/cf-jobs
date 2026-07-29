'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { repetirImportacao } from '@/actions/imports'
import type { ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'

/**
 * "Tentar novamente" do log de importações (doc 05). Abre uma tentativa nova; o
 * conteúdo de até 24h fica em cache, então a repetição vai direto à IA sem
 * consultar a página outra vez.
 *
 * A tentativa aparece na lista em `queued` e avança sozinha — o processamento
 * roda em segundo plano (doc 02), e esta tela não tem o que esperar. Quem quer
 * acompanhar etapa a etapa usa a tela de importar.
 */
export function ImportRetry({ importId }: { importId: string }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  function repetir() {
    iniciar(async () => {
      const nova = await repetirImportacao({ importId })
      if (!nova.ok) {
        setResultado(nova)
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={pendente} onClick={repetir} size="sm" variant="outline">
        {pendente ? 'Tentando…' : 'Tentar novamente'}
      </Button>
      <ActionFeedback resultado={resultado} />
    </div>
  )
}
