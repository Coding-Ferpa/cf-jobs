import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { TaxonomyManager } from '@/components/admin/taxonomy-manager'
import {
  listTaxonomy,
  ROTULO_DA_TAXONOMIA,
  TIPOS_DE_TAXONOMIA,
  type TaxonomyKind,
} from '@/db/queries/admin'
import { requireRole } from '@/lib/auth'
import { cn } from '@/lib/cn'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>
}): Promise<Metadata> {
  const { kind } = await params
  const rotulo = ROTULO_DA_TAXONOMIA[kind as TaxonomyKind]
  return { title: rotulo ? `${rotulo} · Taxonomias` : 'Taxonomias' }
}

function ehTaxonomia(valor: string): valor is TaxonomyKind {
  return (TIPOS_DE_TAXONOMIA as readonly string[]).includes(valor)
}

export default async function TaxonomiaPage({
  params,
}: {
  params: Promise<{ kind: string }>
}) {
  await requireRole('editor')
  const { kind } = await params

  if (!ehTaxonomia(kind)) notFound()

  const linhas = await listTaxonomy(kind)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h2 font-bold">Taxonomias</h1>
        <p className="text-muted-foreground text-caption">
          As listas que alimentam os filtros da área pública e o mapeamento da importação.
        </p>
      </header>

      <nav aria-label="Tipos de taxonomia" className="flex flex-wrap gap-2">
        {TIPOS_DE_TAXONOMIA.map((tipo) => (
          <Link
            aria-current={tipo === kind ? 'page' : undefined}
            className={cn(
              'text-caption rounded-full px-3 py-1.5 transition duration-150',
              tipo === kind
                ? 'bg-surface text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
            href={`/admin/taxonomias/${tipo}`}
            key={tipo}
          >
            {ROTULO_DA_TAXONOMIA[tipo]}
          </Link>
        ))}
      </nav>

      <TaxonomyManager kind={kind} linhas={linhas} />
    </div>
  )
}
