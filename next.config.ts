import type { NextConfig } from 'next'

import { staticSecurityHeaders } from './src/lib/security-headers'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // O Next 15 transmite a metadata em vez de segurar o shell, e quando a
  // página renderiza rápido as tags saem depois do </head> — <title>, canonical
  // e Open Graph acabam no <body>, onde rastreador nenhum garante que lê.
  // Casar todos os user agents devolve a metadata bloqueante para todo mundo.
  // Custo real é baixo: já esperamos os mesmos dados para renderizar a página.
  // Ver docs/adr/0013-metadata-bloqueante-para-todos-os-agentes.md.
  htmlLimitedBots: /.*/,
  async headers() {
    return [{ source: '/:path*', headers: staticSecurityHeaders }]
  },
}

export default nextConfig
