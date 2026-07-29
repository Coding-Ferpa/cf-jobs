import { NextResponse } from 'next/server'

import { buscarImportacao } from '@/db/queries/imports'
import { getCurrentUser } from '@/lib/auth'
import { hasRole } from '@/lib/roles'
import { z } from '@/lib/zod'

/**
 * Estado de uma importação, para a barra de progresso do admin (doc 08).
 *
 * **Por que uma rota e não uma Server Action:** o Next enfileira as Server
 * Actions de um mesmo cliente, e o processamento da importação é uma action
 * que leva dezenas de segundos. Uma action de leitura ficaria presa atrás dela
 * e só responderia quando não houvesse mais nada a mostrar — medido em campo,
 * com a barra parada em "Na fila" enquanto o banco já dizia `classifying`.
 *
 * É interna: não entra no OpenAPI da v1 nem tem CORS. Quem autoriza é a
 * sessão, com o mesmo papel mínimo de quem importa.
 */

export const dynamic = 'force-dynamic'

export async function GET(
  _requisicao: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const usuario = await getCurrentUser()
  if (!usuario || !hasRole(usuario.role, 'editor')) {
    return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 })
  }

  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ erro: 'Importação não encontrada.' }, { status: 404 })
  }

  const importacao = await buscarImportacao(id)
  if (!importacao) {
    return NextResponse.json({ erro: 'Importação não encontrada.' }, { status: 404 })
  }

  return NextResponse.json(
    {
      status: importacao.status,
      jobId: importacao.jobId,
      errorStep: importacao.errorStep,
      errorMessage: importacao.errorMessage,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
