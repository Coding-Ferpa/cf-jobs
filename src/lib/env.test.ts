import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseClientEnv, parseServerEnv } from '@/lib/env'

const validServerEnv = {
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  DATABASE_URL: 'postgresql://postgres@localhost:6543/postgres',
  DIRECT_URL: 'postgresql://postgres@localhost:5432/postgres',
  NVIDIA_API_KEY: 'nvapi-teste',
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

    expect(env.AI_MODEL_PRIMARY).toBe('meta/llama-3.3-70b-instruct')
    expect(env.AI_MODEL_FALLBACK).toBe('mistralai/mistral-small-24b-instruct')
  })

  it('preserva os modelos informados por env', () => {
    const env = parseServerEnv({
      ...validServerEnv,
      AI_MODEL_PRIMARY: 'nvidia/llama-3.1-nemotron-70b-instruct',
      AI_MODEL_FALLBACK: 'meta/llama-3.3-70b-instruct',
    })

    expect(env.AI_MODEL_PRIMARY).toBe('nvidia/llama-3.1-nemotron-70b-instruct')
  })

  it('trata variável em branco como não informada', () => {
    // `AI_MODEL_PRIMARY=` no .env é o jeito documentado de pedir o padrão.
    const env = parseServerEnv({
      ...validServerEnv,
      AI_MODEL_PRIMARY: '',
      AI_MODEL_FALLBACK: '   ',
      SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: '',
    })

    expect(env.AI_MODEL_PRIMARY).toBe('meta/llama-3.3-70b-instruct')
    expect(env.AI_MODEL_FALLBACK).toBe('mistralai/mistral-small-24b-instruct')
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

    expect(env.NVIDIA_API_KEY).toBe('nvapi-teste')
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
