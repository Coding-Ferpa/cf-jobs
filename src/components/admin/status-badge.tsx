import { Badge } from '@/components/ui/badge'

/** Status da vaga em pt-BR, com a cor que o doc 03 dá a cada significado. */

const STATUS = {
  draft: { rotulo: 'Rascunho', classe: 'bg-surface text-muted-foreground' },
  pending_review: { rotulo: 'Em revisão', classe: 'text-warning border-warning' },
  published: { rotulo: 'Publicada', classe: 'text-success border-success' },
  archived: { rotulo: 'Arquivada', classe: 'bg-surface text-muted-foreground' },
  rejected: { rotulo: 'Rejeitada', classe: 'text-destructive border-destructive' },
} as const

export type StatusDeVaga = keyof typeof STATUS

export function StatusBadge({ status }: { status: StatusDeVaga }) {
  const { rotulo, classe } = STATUS[status]

  return (
    <Badge className={classe} variant="outline">
      {rotulo}
    </Badge>
  )
}
