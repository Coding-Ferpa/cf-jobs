import type { Metadata } from 'next'

import { CompanyForm } from '@/components/admin/company-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listCompanies } from '@/db/queries/admin'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = { title: 'Empresas' }

export default async function AdminCompaniesPage() {
  await requireRole('editor')
  const empresas = await listCompanies()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h2 font-bold">Empresas</h1>
        <p className="text-muted-foreground text-caption">
          Toda vaga pertence a uma empresa. Excluir não existe aqui de propósito: empresa
          com vaga cadastrada não pode sumir.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Nova empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyForm />
        </CardContent>
      </Card>

      <div className="border-border overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Site</TableHead>
              <TableHead className="text-right">Vagas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empresas.map((empresa) => (
              <TableRow key={empresa.id}>
                <TableCell className="font-medium">{empresa.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {empresa.slug}
                </TableCell>
                <TableCell className="text-caption">
                  {empresa.website ? (
                    <a
                      className="underline"
                      href={empresa.website}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {new URL(empresa.website).hostname}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {empresa.vagas}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
