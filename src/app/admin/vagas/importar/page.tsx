import type { Metadata } from 'next'
import Link from 'next/link'

import { ImportWizard } from '@/components/admin/import-wizard'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = { title: 'Importar vaga' }

/**
 * A importação roda dentro da própria invocação da action (doc 02), e o teto
 * do plano Hobby da Vercel é 60s — o pipeline se dá 55 e falha de forma
 * retomável antes disso.
 */
export const maxDuration = 60

export default async function ImportarVagaPage() {
  await requireRole('editor')

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          className="text-caption text-muted-foreground hover:text-foreground transition duration-150"
          href="/admin/vagas"
        >
          ← Vagas
        </Link>
        <h1 className="text-h2 font-bold">Importar vaga</h1>
        <p className="text-muted-foreground text-caption">
          A IA lê o anúncio e monta o rascunho. Nada vai ao ar sem a sua revisão.
        </p>
      </header>

      <ImportWizard />
    </div>
  )
}
