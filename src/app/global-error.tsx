'use client'

import { useEffect } from 'react'

import { dsnDoSentry } from '@/lib/observabilidade'

// O `global-error` substitui o layout raiz inteiro, inclusive o `import` de
// CSS que mora nele — sem esta linha a tela de erro sairia sem estilo nenhum.
import './globals.css'

/**
 * Último anteparo do App Router: erro que estoura **durante o render do layout
 * raiz** não é pego por nenhum `error.tsx` de segmento, porque nesse ponto não
 * existe layout para segurar a tela. O Next substitui o documento inteiro por
 * este componente — daí ele precisar trazer `<html>` e `<body>` próprios.
 *
 * É também o único erro que o `onRequestError` do servidor não vê: quando ele
 * acontece na hidratação, quem sabe é o navegador. Sem esta captura, a falha
 * mais visível que o produto pode ter — tela em branco — seria a única sem
 * registro no Sentry.
 *
 * O texto é do projeto, não do template do assistente do Sentry: pt-BR, tokens
 * do design system e sem prometer o que não há (não existe suporte para
 * contatar). O `reset` tenta renderizar de novo, que resolve o caso de falha
 * transitória de rede.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    const dsn = dsnDoSentry()
    if (!dsn) return

    // Import dinâmico pelo mesmo motivo do resto (doc 09): sem DSN o SDK não é
    // baixado. Aqui ele já foi inicializado pelo `instrumentation-client`.
    void import('@sentry/nextjs').then((Sentry) => {
      Sentry.captureException(error)
    })
  }, [error])

  return (
    <html lang="pt-BR">
      <body className="bg-background text-foreground antialiased">
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-h2 font-bold">Alguma coisa quebrou aqui</h1>

          <p className="text-muted-foreground text-caption">
            O erro foi registrado e será investigado. Tentar de novo costuma resolver
            quando a falha é passageira.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              className="bg-primary text-primary-foreground focus-visible:ring-ring rounded-md px-4 py-2 text-sm font-medium transition duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
              onClick={reset}
              type="button"
            >
              Tentar de novo
            </button>

            {/*
              `<a>` e não `<Link>`: o roteador do cliente é justamente o que
              pode estar quebrado aqui, e só a navegação completa recarrega o
              documento inteiro. A regra do Next supõe uma árvore de rotas
              saudável, que é a premissa que esta tela nega.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              className="border-border text-caption hover:bg-surface rounded-md border px-4 py-2 transition duration-150"
              href="/"
            >
              Ir para a home
            </a>
          </div>

          {/*
            O digest é o que liga esta tela ao log do servidor. Sem ele, quem
            relata o problema não tem como ser encontrado no meio dos outros.
          */}
          {error.digest ? (
            <p className="text-muted-foreground font-mono text-xs">
              Código do erro: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
