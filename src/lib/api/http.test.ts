import { describe, expect, it } from 'vitest'

import {
  CACHE_DE_LISTAGEM,
  origemPermitida,
  respostaDePreflight,
  respostaJson,
} from './http'

const SITE = 'https://vagas.codingferpa.org'

describe('respostaJson', () => {
  it('serve JSON com o cache pedido e CORS de leitura', async () => {
    const resposta = respostaJson({ data: [] }, { cache: CACHE_DE_LISTAGEM })

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(resposta.headers.get('cache-control')).toBe(CACHE_DE_LISTAGEM)
    expect(resposta.headers.get('access-control-allow-origin')).toBe('*')
    expect(await resposta.json()).toEqual({ data: [] })
  })

  it('aceita cabeçalhos extras sem perder os de base', () => {
    const resposta = respostaJson(
      {},
      { cache: CACHE_DE_LISTAGEM, cabecalhos: { 'x-ratelimit-limit': '60' } },
    )

    expect(resposta.headers.get('x-ratelimit-limit')).toBe('60')
    expect(resposta.headers.get('cache-control')).toBe(CACHE_DE_LISTAGEM)
  })
})

describe('respostaDePreflight', () => {
  it('responde 204 sem corpo', () => {
    const resposta = respostaDePreflight()

    expect(resposta.status).toBe(204)
    expect(resposta.headers.get('access-control-allow-methods')).toContain('GET')
  })
})

describe('origemPermitida', () => {
  it('aceita a própria origem', () => {
    expect(origemPermitida(SITE, SITE)).toBe(true)
  })

  it('ignora caminho e porta padrão ao comparar', () => {
    expect(origemPermitida('https://vagas.codingferpa.org:443', SITE)).toBe(true)
  })

  it('recusa origem de terceiro', () => {
    expect(origemPermitida('https://outro.site', SITE)).toBe(false)
  })

  it('recusa subdomínio parecido', () => {
    expect(origemPermitida('https://vagas.codingferpa.org.mal.site', SITE)).toBe(false)
  })

  it('recusa origem malformada', () => {
    expect(origemPermitida('nao-e-url', SITE)).toBe(false)
  })

  it('aceita requisição sem Origin, que não vem de navegador', () => {
    expect(origemPermitida(null, SITE)).toBe(true)
    expect(origemPermitida('', SITE)).toBe(true)
  })
})
