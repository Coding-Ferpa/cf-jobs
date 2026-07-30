import { dsnDoSentry, opcoesDoSentry } from '@/lib/observabilidade'

/**
 * Captura de erro no navegador (doc 09).
 *
 * Mesmo trato do servidor: sem DSN, o SDK não é nem baixado. O import dinâmico
 * o coloca em um chunk à parte, então o bundle de quem não usa Sentry continua
 * do tamanho que era — que é o que "DSN opcional por env" precisa significar
 * para valer alguma coisa.
 */

const dsn = dsnDoSentry()

if (dsn) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init(opcoesDoSentry(dsn))
  })
}
