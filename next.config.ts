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

/**
 * Upload de source map para o Sentry (doc 09), **só quando há token**.
 *
 * Sem `SENTRY_AUTH_TOKEN` — fork, CI, contribuidor, qualquer `pnpm build`
 * local — o config sai daqui exatamente como entrou: nenhum plugin, nenhum
 * passo extra, nenhum aviso. É a mesma regra do DSN: quem não usa o serviço não
 * paga nada por ele.
 *
 * Com token, o plugin sobe os mapas no build e os apaga do que é servido — é o
 * que faz o stack trace do painel apontar para a linha do fonte em vez de uma
 * coluna de código minificado.
 *
 * O token é segredo e vive **só na Vercel**, marcado como sensível e restrito a
 * produção. Nunca no GitHub Actions: o CI não precisa subir mapa nenhum, e um
 * segredo a mais no CI é superfície a mais. Organização e projeto vêm por env
 * porque identificam a conta de quem opera o deploy — fixá-los no código
 * quebraria qualquer outro deploy da comunidade.
 */
const tokenDoSentry = process.env.SENTRY_AUTH_TOKEN

/**
 * Exportado como função, e não como promessa solta: é a forma que o Next
 * documenta para config assíncrono, e config que ele não entende é config
 * ignorado em silêncio — junto com os cabeçalhos de segurança do doc 07.
 */
export default async function config(): Promise<NextConfig> {
  if (!tokenDoSentry) return nextConfig

  const { withSentryConfig } = await import('@sentry/nextjs')

  return withSentryConfig(nextConfig, {
    authToken: tokenDoSentry,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // O log do build já é longo; o que importa é falhar quando falhar.
    silent: true,
    // O mapa vai para o Sentry e sai do bundle: ele existe para desminificar o
    // stack trace, não para publicar o fonte.
    sourcemaps: { deleteSourcemapsAfterUpload: true },
    // O SDK oferece um proxy em `/monitoring` para escapar de bloqueador de
    // anúncio. Fica desligado: criaria uma rota nossa encaminhando corpo de
    // requisição para um terceiro, e a CSP do doc 07 já libera o ingest.
    tunnelRoute: undefined,
  })
}
