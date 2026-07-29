import type { Metadata } from 'next'
import Link from 'next/link'

import { ImportWizard } from '@/components/admin/import-wizard'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = { title: 'Importar vaga' }

/**
 * A action desta página devolve na hora e deixa o pipeline seguir por `after()`
 * na mesma invocação (doc 02) — é este teto que a mantém viva enquanto isso.
 *
 * Precisa ser literal: o Next não aceita constante importada aqui. O número
 * vive em `lib/import-runtime`, de onde sai o orçamento do pipeline, e
 * `import-runtime.test.ts` falha se os dois divergirem.
 */
export const maxDuration = 300

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
