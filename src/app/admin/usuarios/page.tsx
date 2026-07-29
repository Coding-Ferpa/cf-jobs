import type { Metadata } from 'next'

import { UserRoleSelect } from '@/components/admin/user-role-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listUsers } from '@/db/queries/admin'
import { requireRole } from '@/lib/auth'
import { formatarData } from '@/lib/format'

export const metadata: Metadata = { title: 'Usuários' }

export default async function AdminUsersPage() {
  // Só administração mexe em papel (doc 07).
  const usuario = await requireRole('admin')
  const pessoas = await listUsers()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h2 font-bold">Usuários</h1>
        <p className="text-muted-foreground text-caption">
          Toda conta nasce leitora. Curadoria publica vaga; administração também promove
          gente e exclui rascunho.
        </p>
      </header>

      <div className="border-border overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Entrou em</TableHead>
              <TableHead className="text-right">Papel</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pessoas.map((pessoa) => (
              <TableRow key={pessoa.id}>
                <TableCell className="font-medium">{pessoa.displayName}</TableCell>
                <TableCell className="text-muted-foreground text-caption">
                  {formatarData(pessoa.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end">
                    <UserRoleSelect
                      ehVoce={pessoa.id === usuario.id}
                      nome={pessoa.displayName}
                      papel={pessoa.role}
                      userId={pessoa.id}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
