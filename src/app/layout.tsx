import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'CF Jobs',
  description: 'Vagas de tecnologia curadas pela comunidade Coding Ferpa.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
