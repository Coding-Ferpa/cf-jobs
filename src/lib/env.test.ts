import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseClientEnv, parseServerEnv, resolveAiEnv } from '@/lib/env'

const validServerEnv = {
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  DATABASE_URL: 'postgresql://postgres@localhost:6543/postgres',
  DIRECT_URL: 'postgresql://postgres@localhost:5432/postgres',
  CRON_SECRET: 'segredo-com-16-chars',
}

describe('parseClientEnv', () => {
  it('aceita as variáveis públicas do contrato', () => {
    const env = parseClientEnv({
      NEXT_PUBLIC_SITE_URL: 'https://vagas.codingferpa.org',
      NEXT_PUBLIC_SUPABASE_URL: 'https://projeto.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })

    expect(env.NEXT_PUBLIC_SITE_URL).toBe('https://vagas.codingferpa.org')
  })

  it('aponta a variável problemática na mensagem de erro', () => {
    expect(() =>
      parseClientEnv({
        NEXT_PUBLIC_SITE_URL: 'não-é-url',
        NEXT_PUBLIC_SUPABASE_URL: 'https://projeto.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      }),
    ).toThrow(/NEXT_PUBLIC_SITE_URL/)
  })

  it('rejeita variável pública ausente', () => {
    expect(() => parseClientEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })
})

describe('parseServerEnv', () => {
  it('aplica os modelos NIM padrão quando não informados', () => {
    const env = parseServerEnv(validServerEnv)

    expect(env.AI_MODEL_PRIMARY).toBe('z-ai/glm-5.2')
    expect(env.AI_MODEL_SECONDARY).toBe('minimaxai/minimax-m3')
    expect(env.AI_MODEL_FALLBACK).toBe('meta/llama-3.3-70b-instruct')
  })

  it('preserva os modelos informados por env', () => {
    const env = parseServerEnv({
      ...validServerEnv,
      AI_MODEL_PRIMARY: 'nvidia/llama-3.1-nemotron-70b-instruct',
      AI_MODEL_FALLBACK: 'mistralai/mistral-small-24b-instruct',
    })

    expect(env.AI_MODEL_PRIMARY).toBe('nvidia/llama-3.1-nemotron-70b-instruct')
    expect(env.AI_MODEL_FALLBACK).toBe('mistralai/mistral-small-24b-instruct')
  })

  it('trata variável em branco como não informada', () => {
    // `AI_MODEL_PRIMARY=` no .env é o jeito documentado de pedir o padrão.
    const env = parseServerEnv({
      ...validServerEnv,
      AI_MODEL_PRIMARY: '',
      AI_MODEL_FALLBACK: '   ',
      SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: '',
    })

    expect(env.AI_MODEL_PRIMARY).toBe('z-ai/glm-5.2')
    expect(env.AI_MODEL_FALLBACK).toBe('meta/llama-3.3-70b-instruct')
    expect(env.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID).toBeUndefined()
  })

  it('mantém as credenciais do GitHub quando informadas', () => {
    const env = parseServerEnv({
      ...validServerEnv,
      SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: 'client-id',
      SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: 'client-secret',
    })

    expect(env.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID).toBe('client-id')
  })

  it('recusa CRON_SECRET curto demais', () => {
    expect(() => parseServerEnv({ ...validServerEnv, CRON_SECRET: 'curto' })).toThrow(
      /CRON_SECRET/,
    )
  })

  it('ignora variáveis extras do process.env', () => {
    const env = parseServerEnv({ ...validServerEnv, PATH: '/usr/bin' })

    expect(env.DATABASE_URL).toBe('postgresql://postgres@localhost:6543/postgres')
  })

  it('sobe sem NVIDIA_API_KEY — só a importação depende dela', () => {
    const env = parseServerEnv(validServerEnv)

    expect(env.NVIDIA_API_KEY).toBeUndefined()
  })
})

describe('resolveAiEnv', () => {
  it('entrega a cascata de modelos e a chave quando ela existe', () => {
    const ai = resolveAiEnv(
      parseServerEnv({ ...validServerEnv, NVIDIA_API_KEY: 'nvapi-teste' }),
    )

    expect(ai).toEqual({
      apiKeys: ['nvapi-teste'],
      models: ['z-ai/glm-5.2', 'minimaxai/minimax-m3', 'meta/llama-3.3-70b-instruct'],
      monthlyTokenBudget: null,
    })
  })

  it('coloca as duas chaves no rodízio quando a segunda existe', () => {
    const ai = resolveAiEnv(
      parseServerEnv({
        ...validServerEnv,
        NVIDIA_API_KEY: 'nvapi-um',
        NVIDIA_API_KEY_FALLBACK: 'nvapi-dois',
      }),
    )

    expect(ai.apiKeys).toEqual(['nvapi-um', 'nvapi-dois'])
  })

  it('não duplica no rodízio uma chave repetida — gastaria a mesma conta duas vezes', () => {
    const ai = resolveAiEnv(
      parseServerEnv({
        ...validServerEnv,
        NVIDIA_API_KEY: 'igual',
        NVIDIA_API_KEY_FALLBACK: 'igual',
      }),
    )

    expect(ai.apiKeys).toEqual(['igual'])
  })

  it('só ativa o orçamento de tokens quando a variável existe', () => {
    const semTeto = resolveAiEnv(
      parseServerEnv({ ...validServerEnv, NVIDIA_API_KEY: 'x' }),
    )
    const comTeto = resolveAiEnv(
      parseServerEnv({
        ...validServerEnv,
        NVIDIA_API_KEY: 'x',
        AI_MONTHLY_TOKEN_BUDGET: '500000',
      }),
    )

    expect(semTeto.monthlyTokenBudget).toBeNull()
    expect(comTeto.monthlyTokenBudget).toBe(500_000)
  })

  it('falha citando a variável e o caminho da correção', () => {
    const env = parseServerEnv(validServerEnv)

    // A mensagem é lida por quem está configurando a importação pela 1a vez.
    expect(() => resolveAiEnv(env)).toThrow(/NVIDIA_API_KEY/)
    expect(() => resolveAiEnv(env)).toThrow(/build\.nvidia\.com/)
  })
})

describe('acessores de ambiente', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('clientEnv lê o process.env e memoriza o resultado', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-local')
    vi.resetModules()

    const { clientEnv } = await import('@/lib/env')

    expect(clientEnv().NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000')
    expect(clientEnv()).toBe(clientEnv())
  })

  it('serverEnv recusa leitura no navegador', async () => {
    // O ambiente de teste é jsdom, então `window` existe — como no cliente.
    const { serverEnv } = await import('@/lib/env')

    expect(() => serverEnv()).toThrow(/só pode ser lido no servidor/)
  })
})
