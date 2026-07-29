import type { Metadata } from 'next'
import { JetBrains_Mono, Poppins } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { clientEnv } from '@/lib/env'

import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  // `optional` em vez de `swap`: a troca tardia da fonte reflowava o título do
  // hero e estourava o orçamento de CLS do doc 08. Com preload, a Poppins
  // chega a tempo na quase totalidade das visitas; quando não chega, a página
  // usa a fallback ajustada e ninguém vê o texto pular.
  display: 'optional',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  // Mesmo motivo da Poppins: os chips de tecnologia do JobCard reembalavam
  // quando a mono chegava, empurrando o rodapé do card — era a única origem
  // de layout shift que sobrava na home.
  display: 'optional',
})

export const metadata: Metadata = {
  // Base para canonical e Open Graph resolverem URL relativa.
  metadataBase: new URL(clientEnv().NEXT_PUBLIC_SITE_URL),
  title: {
    default: 'CF Jobs — Vagas da comunidade Coding Ferpa',
    template: '%s | CF Jobs',
  },
  description:
    'Vagas de tecnologia curadas pela comunidade Coding Ferpa: busca, filtros e o link oficial de cada oportunidade.',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'CF Jobs',
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${poppins.variable} ${jetBrainsMono.variable}`}
      lang="pt-BR"
      suppressHydrationWarning
    >
      <body>
        {/* O nuqs precisa do adapter do App Router para escrever na URL. */}
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  )
}
