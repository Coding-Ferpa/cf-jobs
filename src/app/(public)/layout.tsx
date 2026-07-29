import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { SCRIPT_DE_TEMA } from '@/lib/theme'

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Aplica o tema antes da primeira pintura, senão a página pisca clara
          antes de escurecer. Vive no layout público porque só aqui a CSP
          permite script inline; /admin e /login usam nonce e ficam no tema
          escuro padrão (ADR-0012). */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_TEMA }} />
      <SiteHeader />
      <main className="mx-auto w-full max-w-[var(--container-max)] flex-1 px-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
