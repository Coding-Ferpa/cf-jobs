import type { Metadata } from 'next'
import Link from 'next/link'

import { AdminJobFilters } from '@/components/admin/admin-job-filters'
import { JobRowActions } from '@/components/admin/job-row-actions'
import { StatusBadge } from '@/components/admin/status-badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listAdminJobs, STATUS_DE_VAGA, type JobStatus } from '@/db/queries/admin'
import { requireRole } from '@/lib/auth'
import { formatarData } from '@/lib/format'

export const metadata: Metadata = { title: 'Vagas' }

function statusValido(valor: string | undefined): JobStatus | 'all' {
  if (!valor || valor === 'all') return 'all'
  return (STATUS_DE_VAGA as readonly string[]).includes(valor)
    ? (valor as JobStatus)
    : 'all'
}

function paginaSeguinte(
  parametros: Record<string, string | string[] | undefined>,
  pagina: number,
): string {
  const query = new URLSearchParams()

  for (const [chave, valor] of Object.entries(parametros)) {
    if (chave === 'pagina' || valor === undefined) continue
    query.set(chave, Array.isArray(valor) ? (valor[0] ?? '') : valor)
  }

  query.set('pagina', String(pagina))
  return `/admin/vagas?${query.toString()}`
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Curadoria é o menor papel que mexe em vaga (doc 07). Moderação vê o painel
  // e a fila de sugestões, não esta tela.
  const usuario = await requireRole('editor')
  const parametros = await searchParams

  const q = typeof parametros.q === 'string' ? parametros.q : undefined
  const pagina = Number(parametros.pagina) || 1

  const lista = await listAdminJobs({
    q,
    status: statusValido(
      typeof parametros.status === 'string' ? parametros.status : undefined,
    ),
    pagina,
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 font-bold">Vagas</h1>
          <p className="text-muted-foreground text-caption" aria-live="polite">
            {lista.total === 1 ? '1 vaga' : `${lista.total} vagas`}
            {lista.totalDePaginas > 1
              ? ` · página ${lista.pagina} de ${lista.totalDePaginas}`
              : ''}
          </p>
        </div>

        <Button asChild>
          <Link href="/admin/vagas/nova">Nova vaga</Link>
        </Button>
      </header>

      <AdminJobFilters />

      {lista.linhas.length === 0 ? (
        <div className="border-border rounded-md border border-dashed p-10 text-center">
          <p>Nenhuma vaga com esses filtros.</p>
          <p className="text-muted-foreground text-caption mt-2">
            Tente outra busca ou crie a primeira.
          </p>
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vaga</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Publicada</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead className="text-right">Views / cliques</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.linhas.map((linha) => (
                <TableRow key={linha.id}>
                  <TableCell>
                    <Link
                      className="hover:text-primary-muted font-medium transition duration-150"
                      href={`/admin/vagas/${linha.id}`}
                    >
                      {linha.title}
                    </Link>
                    <p className="text-muted-foreground text-xs">{linha.companyName}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={linha.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-caption">
                    {linha.publishedAt ? formatarData(linha.publishedAt) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-caption">
                    {linha.expiresAt ? formatarData(linha.expiresAt) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right font-mono text-xs">
                    {linha.viewsCount} / {linha.clicksCount}
                  </TableCell>
                  <TableCell>
                    <JobRowActions
                      id={linha.id}
                      papel={usuario.role}
                      status={linha.status}
                      titulo={linha.title}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {lista.totalDePaginas > 1 ? (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3">
          <Button
            asChild={lista.pagina > 1}
            disabled={lista.pagina <= 1}
            variant="outline"
          >
            {lista.pagina > 1 ? (
              <Link href={paginaSeguinte(parametros, lista.pagina - 1)} rel="prev">
                Anterior
              </Link>
            ) : (
              <span>Anterior</span>
            )}
          </Button>

          <span className="text-caption text-muted-foreground">
            {lista.pagina} de {lista.totalDePaginas}
          </span>

          <Button
            asChild={lista.pagina < lista.totalDePaginas}
            disabled={lista.pagina >= lista.totalDePaginas}
            variant="outline"
          >
            {lista.pagina < lista.totalDePaginas ? (
              <Link href={paginaSeguinte(parametros, lista.pagina + 1)} rel="next">
                Próxima
              </Link>
            ) : (
              <span>Próxima</span>
            )}
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
