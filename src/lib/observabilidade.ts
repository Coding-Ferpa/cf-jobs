import { clientEnv } from '@/lib/env'

/**
 * Configuração comum do Sentry (doc 09).
 *
 * O DSN é opcional por decisão do doc: um deploy da comunidade sobe sem conta
 * no Sentry, e nesse caso nada é inicializado — nem o SDK é baixado, porque o
 * import é dinâmico e só acontece quando há DSN.
 *
 * O DSN é público por construção (ele vai no bundle do navegador de qualquer
 * jeito), então mora em `NEXT_PUBLIC_SENTRY_DSN`. Ele não dá acesso de leitura
 * a nada: serve para *enviar* evento, e é por isso que a chave de upload de
 * source map é outra, e essa sim é segredo.
 */

export function dsnDoSentry(): string | undefined {
  return clientEnv().NEXT_PUBLIC_SENTRY_DSN
}

/**
 * As mesmas opções nos dois lados. Duas escolhas merecem explicação:
 *
 * - **`sendDefaultPii: false`.** É o padrão do SDK, e está aqui escrito porque
 *   o assistente de instalação do Sentry ativa. O doc 07 não guarda IP nem em
 *   `job_events`; mandá-lo para fora do projeto por causa de um stack trace
 *   seria contradizer a decisão inteira de analytics anônimo.
 * - **`tracesSampleRate: 0`.** O doc 09 pede captura de erro, não performance.
 *   Traces consomem a cota gratuita rápido e as métricas de web vitals já vêm
 *   do Vercel Speed Insights.
 */
export function opcoesDoSentry(dsn: string) {
  return {
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Sem isso, erro de desenvolvimento vira ruído no painel de produção.
    enabled: process.env.NODE_ENV === 'production',
  }
}
