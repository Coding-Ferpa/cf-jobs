'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { definirPapel } from '@/actions/admin'
import type { ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { USER_ROLES, type UserRole } from '@/lib/roles'

/** Promover e rebaixar (doc 06). Toda mudança é auditada pela action. */

const ROTULO: Record<UserRole, string> = {
  reader: 'Leitor',
  moderator: 'Moderação',
  editor: 'Curadoria',
  admin: 'Administração',
}

export function UserRoleSelect({
  userId,
  papel,
  ehVoce,
  nome,
}: {
  userId: string
  papel: UserRole
  ehVoce: boolean
  nome: string
}) {
  const router = useRouter()
  const [pendente, iniciarTransicao] = useTransition()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  if (ehVoce) {
    return (
      <span className="text-muted-foreground text-caption">{ROTULO[papel]} · você</span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Select
        disabled={pendente}
        onValueChange={(valor) =>
          iniciarTransicao(async () => {
            const resposta = await definirPapel({ userId, role: valor as UserRole })
            setResultado(resposta)
            if (resposta.ok) router.refresh()
          })
        }
        value={papel}
      >
        <SelectTrigger aria-label={`Papel de ${nome}`} className="w-[180px]" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {USER_ROLES.map((opcao) => (
            <SelectItem key={opcao} value={opcao}>
              {ROTULO[opcao]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ActionFeedback resultado={resultado} />
    </div>
  )
}
