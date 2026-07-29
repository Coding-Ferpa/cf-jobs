'use client'

import {
  Briefcase,
  Building2,
  LayoutDashboard,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { hasRole, type UserRole } from '@/lib/roles'
import { cn } from '@/lib/cn'

/**
 * Navegação fixa do admin (doc 03). Cada item declara o papel mínimo que o
 * enxerga — é conveniência de UI: quem garante o acesso é o `requireRole` de
 * cada rota e, abaixo dele, a RLS.
 */

type Item = {
  href: string
  rotulo: string
  icone: LucideIcon
  papelMinimo: UserRole
}

const ITENS: Item[] = [
  { href: '/admin', rotulo: 'Painel', icone: LayoutDashboard, papelMinimo: 'moderator' },
  { href: '/admin/vagas', rotulo: 'Vagas', icone: Briefcase, papelMinimo: 'editor' },
  {
    href: '/admin/empresas',
    rotulo: 'Empresas',
    icone: Building2,
    papelMinimo: 'editor',
  },
  {
    href: '/admin/taxonomias',
    rotulo: 'Taxonomias',
    icone: Tags,
    papelMinimo: 'editor',
  },
  { href: '/admin/usuarios', rotulo: 'Usuários', icone: Users, papelMinimo: 'admin' },
]

/** `/admin` só casa exato; as demais casam com as subrotas. */
function estaAtivo(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname.startsWith(href)
}

export function AdminNav({ papel }: { papel: UserRole }) {
  const pathname = usePathname()
  const visiveis = ITENS.filter((item) => hasRole(papel, item.papelMinimo))

  return (
    <nav
      aria-label="Navegação do admin"
      className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
    >
      {visiveis.map((item) => {
        const ativo = estaAtivo(pathname, item.href)
        const Icone = item.icone

        return (
          <Link
            aria-current={ativo ? 'page' : undefined}
            className={cn(
              'text-caption flex shrink-0 items-center gap-3 rounded-md px-3 py-2 transition duration-150',
              ativo
                ? 'bg-surface text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface/60',
            )}
            href={item.href}
            key={item.href}
          >
            <Icone aria-hidden="true" className="size-4 shrink-0" />
            {item.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
