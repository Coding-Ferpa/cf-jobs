import type { Instrumentation } from 'next'

import { dsnDoSentry, opcoesDoSentry } from '@/lib/observabilidade'

/**
 * Captura de erro de runtime no servidor (doc 09).
 *
 * O import do SDK é dinâmico e depende do DSN: sem `NEXT_PUBLIC_SENTRY_DSN` o
 * `@sentry/nextjs` nem é carregado, e quem clona o projeto não paga nada por um
 * serviço que não usa.
 *
 * Este arquivo já existiu para configurar o locale do Zod e foi removido —
 * `register()` roda em um módulo que não é o das rotas, e a configuração não
 * alcançava o `z` delas ([ADR-0016](../docs/adr/0016-locale-do-zod-no-modulo-e-nao-no-bootstrap.md)).
 * O Sentry é o caso oposto: ele registra handlers de processo, que é
 * exatamente o que este gancho existe para fazer.
 */

export async function register() {
  const dsn = dsnDoSentry()
  if (!dsn) return

  // O edge runtime tem SDK próprio; o middleware do projeto não faz I/O de
  // risco, então só o runtime Node é instrumentado.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const Sentry = await import('@sentry/nextjs')
  Sentry.init(opcoesDoSentry(dsn))
}

/**
 * Erros de Server Component, Server Action e route handler não passam por
 * `try/catch` nenhum — o Next os entrega aqui. Sem este gancho, o erro mais
 * caro do produto (uma importação que quebra no servidor) só apareceria no log
 * da Vercel.
 */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!dsnDoSentry()) return

  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
