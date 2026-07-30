import { dsnDoSentry, opcoesDoSentry } from '@/lib/observabilidade'

/**
 * Captura de erro no navegador (doc 09).
 *
 * Mesmo trato do servidor: sem DSN, o SDK não é nem baixado. O import dinâmico
 * o coloca em um chunk à parte, então o bundle de quem não usa Sentry continua
 * do tamanho que era — que é o que "DSN opcional por env" precisa significar
 * para valer alguma coisa.
 */

/**
 * O plugin do build pede um `onRouterTransitionStart` daqui, e ele **não é
 * exportado de propósito**. O gancho serve para instrumentar navegação como
 * trace, e `tracesSampleRate` é 0 (doc 09 pede captura de erro, não
 * performance): a exportação criaria trabalho para não registrar nada. Pior,
 * exigiria importar o SDK estaticamente, quebrando a promessa de que sem DSN
 * ele não é nem baixado. Se um dia o projeto ligar tracing, o aviso volta a
 * fazer sentido — e aí o import estático passa a ser aceitável.
 */
const dsn = dsnDoSentry()

if (dsn) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init(opcoesDoSentry(dsn))
  })
}
