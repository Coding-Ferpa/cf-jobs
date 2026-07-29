import type { Metadata } from 'next'
import Link from 'next/link'

import { sair } from '@/actions/auth'
import { requireRole } from '@/lib/auth'
import { MIN_ADMIN_ROLE } from '@/lib/roles'

export const metadata: Metadata = {
  title: { default: 'Administração', template: '%s | Administração' },
  robots: { index: false, follow: false },
}

// Dados do admin são sempre frescos (doc 01): nada de cache aqui.
export const dynamic = 'force-dynamic'

const NOME_DO_PAPEL = {
  reader: 'Leitor',
  moderator: 'Moderação',
  editor: 'Curadoria',
  admin: 'Administração',
} as const

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // O middleware já redireciona quem não entrou, mas a autorização de verdade
  // acontece aqui, no servidor, a cada renderização (doc 07).
  const usuario = await requireRole(MIN_ADMIN_ROLE)

  return (
    <div className="min-h-dvh">
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex h-[var(--header-height)] w-full max-w-[var(--container-max)] items-center justify-between gap-4 px-6">
          <Link className="font-semibold" href="/admin">
            CF Jobs <span className="text-muted-foreground font-normal">· admin</span>
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-caption text-muted-foreground">
              {usuario.email}
              <span className="bg-surface text-muted-foreground ml-2 rounded-full px-2 py-0.5 font-mono text-xs">
                {NOME_DO_PAPEL[usuario.role]}
              </span>
            </span>

            <form action={sair}>
              <button
                className="text-caption border-border hover:border-primary-muted rounded-full border px-4 py-1.5 transition duration-150"
                type="submit"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[var(--container-max)] px-6 py-10">
        {children}
      </main>
    </div>
  )
}
