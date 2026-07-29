import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { TIPOS_DE_TAXONOMIA } from '@/db/queries/admin'

export const metadata: Metadata = { title: 'Taxonomias' }

/** Sem tipo escolhido, cai no primeiro — a tela sempre mostra alguma coisa. */
export default function TaxonomiasPage() {
  redirect(`/admin/taxonomias/${TIPOS_DE_TAXONOMIA[0]}`)
}
