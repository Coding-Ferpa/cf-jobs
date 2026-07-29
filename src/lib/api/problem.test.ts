import { describe, expect, it } from 'vitest'

import {
  entradaInvalida,
  erroInterno,
  limiteExcedido,
  naoAutorizado,
  naoEncontrado,
  problema,
  TIPO_DE_CONTEUDO,
  type ProblemDetails,
} from './problem'

async function corpoDe(resposta: Response): Promise<ProblemDetails> {
  return (await resposta.json()) as ProblemDetails
}

describe('problema', () => {
  it('responde no content-type do RFC 9457', async () => {
    const resposta = problema({
      status: 418,
      titulo: 'Sou um bule',
      detalhe: 'Não faço café.',
      instancia: '/api/v1/cha',
    })

    expect(resposta.status).toBe(418)
    expect(resposta.headers.get('content-type')).toBe(TIPO_DE_CONTEUDO)
    expect(await corpoDe(resposta)).toEqual({
      type: 'about:blank',
      title: 'Sou um bule',
      status: 418,
      detail: 'Não faço café.',
      instance: '/api/v1/cha',
    })
  })

  it('repete o status no corpo e no envelope HTTP', async () => {
    const resposta = naoEncontrado('/api/v1/jobs/x', 'Vaga inexistente.')
    const corpo = await corpoDe(resposta)

    expect(corpo.status).toBe(resposta.status)
  })

  it('carrega cabeçalhos extras sem perder o content-type', () => {
    const resposta = limiteExcedido('/api/v1/jobs', {
      'retry-after': '30',
      'x-ratelimit-limit': '60',
    })

    expect(resposta.status).toBe(429)
    expect(resposta.headers.get('retry-after')).toBe('30')
    expect(resposta.headers.get('x-ratelimit-limit')).toBe('60')
    expect(resposta.headers.get('content-type')).toBe(TIPO_DE_CONTEUDO)
  })

  it('usa o status certo em cada atalho', () => {
    expect(entradaInvalida('/i', 'x').status).toBe(400)
    expect(naoAutorizado('/i').status).toBe(401)
    expect(naoEncontrado('/i', 'x').status).toBe(404)
    expect(erroInterno('/i').status).toBe(500)
  })

  it('não vaza detalhe interno no 500', async () => {
    const corpo = await corpoDe(erroInterno('/api/v1/jobs'))

    expect(corpo.detail).not.toMatch(/stack|sql|postgres/i)
  })
})
