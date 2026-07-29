import { describe, expect, it } from 'vitest'

import { LIMITE_PADRAO } from '@/lib/cursor'

import { analisarConsulta, paraFiltros, primeiroErro } from './jobs-query'

function analisar(query: string) {
  return analisarConsulta(new URLSearchParams(query))
}

describe('analisarConsulta', () => {
  it('aplica os padrões do doc 06 quando não vem nada', () => {
    const resultado = analisar('')

    expect(resultado.success).toBe(true)
    expect(resultado.data).toMatchObject({
      status: 'published',
      sort: 'recent',
      limit: LIMITE_PADRAO,
    })
  })

  it('quebra lista em CSV', () => {
    expect(analisar('tech=react,typescript').data?.tech).toEqual(['react', 'typescript'])
  })

  it('aceita o mesmo parâmetro repetido como se fosse CSV', () => {
    expect(analisar('tech=react&tech=go').data?.tech).toEqual(['react', 'go'])
  })

  it('descarta valores vazios e espaços da lista', () => {
    expect(analisar('tech=react,,%20go%20,').data?.tech).toEqual(['react', 'go'])
  })

  it('ignora parâmetro desconhecido em vez de recusar a requisição', () => {
    const resultado = analisar('utm_campaign=newsletter')

    expect(resultado.success).toBe(true)
    expect(resultado.data).not.toHaveProperty('utm_campaign')
  })

  it('recusa limit acima do teto', () => {
    expect(analisar('limit=51').success).toBe(false)
  })

  it('recusa limit não numérico', () => {
    expect(analisar('limit=muitos').success).toBe(false)
  })

  it('aceita limit dentro do teto', () => {
    expect(analisar('limit=50').data?.limit).toBe(50)
  })

  it('recusa status fora do enum', () => {
    expect(analisar('status=rascunho').success).toBe(false)
  })

  it('recusa país que não é código de duas letras', () => {
    expect(analisar('country=Brasil').success).toBe(false)
    expect(analisar('country=BR').success).toBe(true)
  })

  it('recusa lista longa demais', () => {
    const muitas = Array.from({ length: 21 }, (_, i) => `t${i}`).join(',')

    expect(analisar(`tech=${muitas}`).success).toBe(false)
  })
})

describe('paraFiltros', () => {
  it('traduz snake_case do contrato para camelCase do banco', () => {
    const consulta = analisar('work_mode=remote&contract_type=clt').data

    expect(consulta).toBeDefined()
    expect(paraFiltros(consulta!)).toMatchObject({
      workMode: ['remote'],
      contractType: ['clt'],
    })
  })

  it('manda cursor ausente como null, que é o que a query espera', () => {
    const consulta = analisar('').data

    expect(paraFiltros(consulta!).cursor).toBeNull()
  })
})

describe('primeiroErro', () => {
  it('nomeia o parâmetro problemático', () => {
    const resultado = analisar('limit=999')

    expect(resultado.success).toBe(false)
    expect(primeiroErro(resultado.error!)).toContain('limit')
  })
})
