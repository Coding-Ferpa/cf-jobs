import type { Metadata } from 'next'
import Link from 'next/link'

import { JobForm } from '@/components/admin/job-form'
import { getOpcoesDoFormulario } from '@/db/queries/admin'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = { title: 'Nova vaga' }

export default async function NovaVagaPage() {
  await requireRole('editor')
  const opcoes = await getOpcoesDoFormulario()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          className="text-caption text-muted-foreground hover:text-foreground transition duration-150"
          href="/admin/vagas"
        >
          ← Vagas
        </Link>
        <h1 className="text-h2 font-bold">Nova vaga</h1>
        <p className="text-muted-foreground text-caption">
          Cadastro manual. A importação por URL entra com o pipeline de IA.
        </p>
      </header>

      <JobForm opcoes={opcoes} />
    </div>
  )
}
