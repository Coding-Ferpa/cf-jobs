import type { Metadata } from 'next'
import { JetBrains_Mono, Poppins } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'

import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'CF Jobs — Vagas da comunidade Coding Ferpa',
    template: '%s | CF Jobs',
  },
  description:
    'Vagas de tecnologia curadas pela comunidade Coding Ferpa: busca, filtros e o link oficial de cada oportunidade.',
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
