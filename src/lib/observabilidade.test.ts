import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * A promessa do doc 09 é "DSN opcional por env": sem DSN, nada de Sentry. É
 * uma linha de `if` — e é exatamente o tipo de linha que alguém apaga ao mexer
 * na configuração, deixando um deploy da comunidade mandando erro para uma
 * conta que não é dele.
 */

function ambienteValido() {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-local')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('dsnDoSentry', () => {
  it('é indefinido quando a variável não existe', async () => {
    ambienteValido()
    vi.resetModules()

    const { dsnDoSentry } = await import('@/lib/observabilidade')

    expect(dsnDoSentry()).toBeUndefined()
  })

  it('devolve o DSN configurado', async () => {
    ambienteValido()
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://chave@o1.ingest.sentry.io/2')
    vi.resetModules()

    const { dsnDoSentry } = await import('@/lib/observabilidade')

    expect(dsnDoSentry()).toBe('https://chave@o1.ingest.sentry.io/2')
  })
})

describe('opcoesDoSentry', () => {
  it('não manda dado pessoal nem traces', async () => {
    ambienteValido()
    vi.resetModules()

    const { opcoesDoSentry } = await import('@/lib/observabilidade')
    const opcoes = opcoesDoSentry('https://chave@o1.ingest.sentry.io/2')

    // O doc 07 não guarda nem IP do visitante no próprio banco; mandá-lo para
    // fora por causa de um stack trace contradiria a decisão inteira.
    expect(opcoes.sendDefaultPii).toBe(false)
    // O doc 09 pede captura de erro, não performance.
    expect(opcoes.tracesSampleRate).toBe(0)
  })
})

describe('register do instrumentation', () => {
  it('não carrega o Sentry sem DSN', async () => {
    ambienteValido()
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.resetModules()

    const init = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({ init, captureRequestError: vi.fn() }))

    const { register } = await import('@/instrumentation')
    await register()

    expect(init).not.toHaveBeenCalled()
  })

  it('inicializa com DSN, e só no runtime Node', async () => {
    ambienteValido()
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://chave@o1.ingest.sentry.io/2')
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    vi.resetModules()

    const init = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({ init, captureRequestError: vi.fn() }))

    const { register } = await import('@/instrumentation')
    await register()

    // O edge tem SDK próprio e o middleware do projeto não faz I/O de risco.
    expect(init).not.toHaveBeenCalled()

    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    await register()

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://chave@o1.ingest.sentry.io/2' }),
    )
  })
})
