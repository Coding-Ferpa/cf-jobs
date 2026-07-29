import { validate } from '@scalar/openapi-parser'
import { describe, expect, it } from 'vitest'

import { documentoOpenApi } from './openapi'

const SITE = 'https://vagas.codingferpa.org'

/**
 * As asserções de estrutura navegam o documento como JSON, que é a forma em
 * que ele chega a quem consome. Os tipos do gerador descrevem a entrada, não a
 * saída, e brigar com eles aqui esconderia o que está sendo verificado.
 */
type Json = Record<string, unknown>

const documento = JSON.parse(JSON.stringify(documentoOpenApi(SITE))) as Json

function em(objeto: unknown, ...caminho: string[]): Json | undefined {
  let atual: unknown = objeto
  for (const chave of caminho) {
    if (typeof atual !== 'object' || atual === null) return undefined
    atual = (atual as Json)[chave]
  }
  return typeof atual === 'object' && atual !== null ? (atual as Json) : undefined
}

describe('documentoOpenApi', () => {
  it('é um OpenAPI 3.1 válido', async () => {
    const resultado = await validate(structuredClone(documento))

    // A mensagem entra no expect para o erro do CI apontar o que quebrou.
    expect(resultado.errors ?? []).toEqual([])
    expect(resultado.valid).toBe(true)
    expect(resultado.version).toBe('3.1')
  })

  it('documenta os quatro endpoints do doc 06', () => {
    expect(Object.keys(em(documento, 'paths') ?? {}).sort()).toEqual([
      '/events',
      '/jobs',
      '/jobs/{slug}',
      '/taxonomies',
    ])
  })

  it('aponta o servidor para a instalação que serviu o spec', () => {
    const servidores = documento.servers as { url: string }[]

    expect(servidores[0]?.url).toBe(`${SITE}/api/v1`)
  })

  it('declara todos os filtros que a listagem aceita', () => {
    const parametros = (
      em(documento, 'paths', '/jobs', 'get')?.parameters as { name: string }[]
    ).map((parametro) => parametro.name)

    // Se um filtro entrar no schema e não aparecer aqui, o contrato publicado
    // ficou menor que o real — que é o tipo de mentira que a spec existe para
    // impedir.
    expect(parametros.sort()).toEqual([
      'city',
      'company',
      'contract_type',
      'country',
      'cursor',
      'limit',
      'q',
      'role',
      'seniority',
      'sort',
      'state',
      'status',
      'tag',
      'tech',
      'work_mode',
    ])
  })

  it('descreve os cabeçalhos de rate limit nas respostas de sucesso', () => {
    const cabecalhos = em(
      documento,
      'paths',
      '/jobs',
      'get',
      'responses',
      '200',
      'headers',
    )

    expect(Object.keys(cabecalhos ?? {})).toEqual([
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ])
  })

  it('descreve toda resposta de falha no formato RFC 9457', () => {
    const falhas: string[] = []

    for (const [caminho, item] of Object.entries(em(documento, 'paths') ?? {})) {
      for (const [metodo, operacao] of Object.entries(em(item) ?? {})) {
        for (const [status, resposta] of Object.entries(
          em(operacao, 'responses') ?? {},
        )) {
          if (Number(status) < 400) continue
          if (!em(resposta, 'content', 'application/problem+json')) {
            falhas.push(`${metodo.toUpperCase()} ${caminho} → ${status}`)
          }
        }
      }
    }

    expect(falhas).toEqual([])
  })

  it('cobre pelo menos os erros de validação, limite e ausência', () => {
    const statusDocumentados = new Set(
      Object.values(em(documento, 'paths') ?? {}).flatMap((item) =>
        Object.values(em(item) ?? {}).flatMap((operacao) =>
          Object.keys(em(operacao, 'responses') ?? {}),
        ),
      ),
    )

    expect(statusDocumentados).toContain('400')
    expect(statusDocumentados).toContain('404')
    expect(statusDocumentados).toContain('429')
  })
})
