import { describe, expect, it } from 'vitest'

import { canonicalizarUrl, hashDaUrl } from './source-url'

/**
 * O hash é a chave única de dedup de vaga: se a normalização variar, a mesma
 * vaga entra duas vezes. Cada caso aqui é uma forma de o mesmo anúncio chegar
 * com URL diferente.
 */

const BASE = 'https://vagas.exemplo.test/vaga/123'

describe('canonicalizarUrl', () => {
  it('remove UTMs e outros parâmetros de campanha', () => {
    expect(
      canonicalizarUrl(`${BASE}?utm_source=linkedin&utm_medium=social&gclid=abc&ref=x`),
    ).toBe(BASE)
  })

  it('preserva os parâmetros que identificam a vaga', () => {
    expect(canonicalizarUrl(`${BASE}?id=42&utm_campaign=maio`)).toBe(`${BASE}?id=42`)
  })

  it('ordena os parâmetros restantes', () => {
    expect(canonicalizarUrl(`${BASE}?b=2&a=1`)).toBe(canonicalizarUrl(`${BASE}?a=1&b=2`))
  })

  it('descarta fragmento, normaliza host e tira a barra final', () => {
    expect(canonicalizarUrl('https://VAGAS.Exemplo.Test/vaga/123/#requisitos')).toBe(BASE)
  })

  it('tira a porta quando ela é a padrão do protocolo', () => {
    expect(canonicalizarUrl('https://vagas.exemplo.test:443/vaga/123')).toBe(BASE)
    expect(canonicalizarUrl('https://vagas.exemplo.test:8443/vaga/123')).toBe(
      'https://vagas.exemplo.test:8443/vaga/123',
    )
  })

  it('mantém a barra da raiz', () => {
    expect(canonicalizarUrl('https://vagas.exemplo.test/')).toBe(
      'https://vagas.exemplo.test/',
    )
  })

  it('não confunde caminhos que só diferem por maiúscula', () => {
    // Host é case-insensitive, caminho não: /Vaga e /vaga podem ser páginas
    // diferentes e não podem colidir no dedup.
    expect(canonicalizarUrl('https://vagas.exemplo.test/Vaga/123')).not.toBe(BASE)
  })

  it('recusa o que não é URL', () => {
    expect(() => canonicalizarUrl('não é uma url')).toThrow()
  })
})

describe('hashDaUrl', () => {
  it('dá o mesmo hash para URLs que só diferem em rastreio', () => {
    expect(hashDaUrl(`${BASE}?utm_source=x`)).toBe(hashDaUrl(`${BASE}/`))
  })

  it('dá hashes diferentes para vagas diferentes', () => {
    expect(hashDaUrl(BASE)).not.toBe(hashDaUrl(`${BASE}4`))
  })

  it('devolve sha256 em hexadecimal', () => {
    expect(hashDaUrl(BASE)).toMatch(/^[0-9a-f]{64}$/)
  })
})
