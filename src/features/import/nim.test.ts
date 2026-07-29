import { describe, expect, it, vi } from 'vitest'

import {
  ClienteNim,
  ESPERA_MAXIMA_MS,
  ESPERA_MINIMA_MS,
  FalhaDaIa,
  ORCAMENTO_PARA_SEGUNDO_CICLO_MS,
  type ConfigDoNim,
} from './nim'

/**
 * Cliente NIM com a API mockada (doc 12): rodízio de chaves, cascata de
 * modelos, descoberta do `guided_json` e a espera longa.
 *
 * O mock é um `fetch` injetado — assim o teste vê o que sai de verdade na
 * requisição (cabeçalho de autorização, corpo com `nvext`), em vez de confiar
 * numa camada de mentira acima da SDK.
 */

const MODELOS: [string, string, string] = ['modelo-a', 'modelo-b', 'modelo-c']
const CHAVES = ['chave-um', 'chave-dois']

type Chamada = { autorizacao: string | null; corpo: Record<string, unknown> }

function servidorFalso(respostas: (() => Response)[]) {
  const chamadas: Chamada[] = []
  let indice = 0

  const buscar = (async (url: string | URL | Request, init?: RequestInit) => {
    void url
    chamadas.push({
      autorizacao: new Headers(init?.headers).get('authorization'),
      corpo: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    })

    const proxima = respostas[Math.min(indice, respostas.length - 1)]
    indice += 1
    return proxima!()
  }) as unknown as typeof fetch

  return { buscar, chamadas }
}

function respostaOk(conteudo = '{"ok":true}') {
  return () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1,
        model: 'modelo',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: conteudo },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
}

function respostaErro(status: number, mensagem = 'falhou') {
  return () =>
    new Response(JSON.stringify({ error: { message: mensagem } }), {
      status,
      headers: { 'content-type': 'application/json' },
    })
}

function cliente(config: Partial<ConfigDoNim> & { buscar: typeof fetch }) {
  return new ClienteNim({
    apiKeys: CHAVES,
    models: MODELOS,
    baseURL: 'https://nim.exemplo.test/v1',
    dormir: () => Promise.resolve(),
    aleatorio: () => 0.5,
    ...config,
  })
}

const MENSAGENS = [{ role: 'user' as const, content: 'oi' }]

describe('rodízio de chaves', () => {
  it('alterna a chave a cada chamada', async () => {
    const { buscar, chamadas } = servidorFalso([respostaOk()])
    const nim = cliente({ buscar })

    await nim.gerar(MENSAGENS)
    await nim.gerar(MENSAGENS)
    await nim.gerar(MENSAGENS)

    expect(chamadas.map((c) => c.autorizacao)).toEqual([
      'Bearer chave-um',
      'Bearer chave-dois',
      'Bearer chave-um',
    ])
  })

  it('a tentativa seguinte a um 429 já sai pela outra chave', async () => {
    const { buscar, chamadas } = servidorFalso([respostaErro(429), respostaOk()])
    const nim = cliente({ buscar })

    await nim.gerar(MENSAGENS)

    expect(chamadas).toHaveLength(2)
    expect(chamadas[0]?.autorizacao).toBe('Bearer chave-um')
    expect(chamadas[1]?.autorizacao).toBe('Bearer chave-dois')
  })

  it('não gira quando só existe uma chave', async () => {
    const { buscar, chamadas } = servidorFalso([respostaOk()])
    const nim = cliente({ buscar, apiKeys: ['unica'] })

    await nim.gerar(MENSAGENS)
    await nim.gerar(MENSAGENS)

    expect(chamadas.every((c) => c.autorizacao === 'Bearer unica')).toBe(true)
  })

  it('recusa ser criado sem chave nenhuma', () => {
    expect(() => cliente({ buscar: servidorFalso([]).buscar, apiKeys: [] })).toThrow(
      FalhaDaIa,
    )
  })
})

describe('cascata de modelos', () => {
  it('desce para o próximo modelo quando o anterior esgota as tentativas', async () => {
    const { buscar, chamadas } = servidorFalso([
      respostaErro(500),
      respostaErro(500),
      respostaOk(),
    ])
    const nim = cliente({ buscar })

    const resultado = await nim.gerar(MENSAGENS)

    expect(resultado.modelo).toBe('modelo-b')
    expect(chamadas.map((c) => c.corpo.model)).toEqual([
      'modelo-a',
      'modelo-a',
      'modelo-b',
    ])
  })

  it('registra qual modelo respondeu e quantos tokens custou', async () => {
    const { buscar } = servidorFalso([respostaOk()])

    const resultado = await cliente({ buscar }).gerar(MENSAGENS)

    expect(resultado).toMatchObject({ modelo: 'modelo-a', tokensIn: 120, tokensOut: 45 })
  })

  it('desiste do modelo no primeiro erro que repetir não conserta', async () => {
    const { buscar, chamadas } = servidorFalso([respostaErro(400, 'prompt inválido')])

    await expect(cliente({ buscar }).gerar(MENSAGENS)).rejects.toBeInstanceOf(FalhaDaIa)

    // Uma tentativa por modelo, três modelos, dois ciclos.
    expect(chamadas).toHaveLength(6)
  })
})

describe('guided_json verificado empiricamente', () => {
  const schema = { type: 'object', properties: {} }

  it('manda nvext na primeira chamada', async () => {
    const { buscar, chamadas } = servidorFalso([respostaOk()])

    await cliente({ buscar, jsonSchema: schema }).gerar(MENSAGENS)

    expect(chamadas[0]?.corpo.nvext).toEqual({ guided_json: schema })
  })

  it('aprende que o modelo não suporta e repete sem nvext', async () => {
    const { buscar, chamadas } = servidorFalso([
      respostaErro(400, 'nvext.guided_json is not supported by this model'),
      respostaOk(),
    ])
    const nim = cliente({ buscar, jsonSchema: schema })

    const resultado = await nim.gerar(MENSAGENS)

    expect(chamadas[0]?.corpo.nvext).toBeDefined()
    expect(chamadas[1]?.corpo.nvext).toBeUndefined()
    expect(resultado.guidedJson).toBe(false)
    expect(nim.suporte('modelo-a')).toBe(false)
  })

  it('não tenta nvext de novo no mesmo modelo depois de aprender', async () => {
    const { buscar, chamadas } = servidorFalso([
      respostaErro(400, 'guided decoding unavailable'),
      respostaOk(),
      respostaOk(),
    ])
    const nim = cliente({ buscar, jsonSchema: schema })

    await nim.gerar(MENSAGENS)
    await nim.gerar(MENSAGENS)

    expect(chamadas[2]?.corpo.nvext).toBeUndefined()
  })

  it('anota o suporte quando a chamada com nvext dá certo', async () => {
    const { buscar } = servidorFalso([respostaOk()])
    const nim = cliente({ buscar, jsonSchema: schema })

    const resultado = await nim.gerar(MENSAGENS)

    expect(resultado.guidedJson).toBe(true)
    expect(nim.suporte('modelo-a')).toBe(true)
  })

  it('sem schema configurado, nvext nunca sai', async () => {
    const { buscar, chamadas } = servidorFalso([respostaOk()])

    await cliente({ buscar }).gerar(MENSAGENS)

    expect(chamadas[0]?.corpo.nvext).toBeUndefined()
  })
})

describe('espera longa depois da cascata esgotada', () => {
  it('espera entre 15 e 30 segundos e repete o ciclo uma vez', async () => {
    const { buscar, chamadas } = servidorFalso([respostaErro(503)])
    const dormir = vi.fn().mockResolvedValue(undefined)

    await expect(
      cliente({ buscar, dormir, aleatorio: () => 0.5 }).gerar(MENSAGENS),
    ).rejects.toMatchObject({ motivo: 'cascata_esgotada' })

    const esperaLonga = dormir.mock.calls
      .map(([ms]) => ms as number)
      .find((ms) => ms >= ESPERA_MINIMA_MS)

    expect(esperaLonga).toBeGreaterThanOrEqual(ESPERA_MINIMA_MS)
    expect(esperaLonga).toBeLessThanOrEqual(ESPERA_MAXIMA_MS)
    // Dois ciclos completos: 3 modelos × 2 tentativas × 2 ciclos.
    expect(chamadas).toHaveLength(12)
  })

  it('o jitter varia a espera de verdade', async () => {
    const esperas: number[] = []

    for (const sorteio of [0, 1]) {
      const dormir = vi.fn().mockResolvedValue(undefined)
      const { buscar } = servidorFalso([respostaErro(503)])

      await cliente({ buscar, dormir, aleatorio: () => sorteio })
        .gerar(MENSAGENS)
        .catch(() => undefined)

      esperas.push(
        dormir.mock.calls
          .map(([ms]) => ms as number)
          .find((ms) => ms >= ESPERA_MINIMA_MS)!,
      )
    }

    expect(esperas[0]).toBe(ESPERA_MINIMA_MS)
    expect(esperas[1]).toBe(ESPERA_MAXIMA_MS)
  })

  it('não tenta o segundo ciclo quando o orçamento de tempo não comporta', async () => {
    const { buscar, chamadas } = servidorFalso([respostaErro(503)])
    const dormir = vi.fn().mockResolvedValue(undefined)

    await expect(
      cliente({
        buscar,
        dormir,
        orcamentoRestanteMs: () => ORCAMENTO_PARA_SEGUNDO_CICLO_MS - 1,
      }).gerar(MENSAGENS),
    ).rejects.toMatchObject({ motivo: 'orcamento_de_tempo' })

    // Só o primeiro ciclo, e sem a espera longa.
    expect(chamadas).toHaveLength(6)
    expect(dormir.mock.calls.every(([ms]) => (ms as number) < ESPERA_MINIMA_MS)).toBe(
      true,
    )
  })

  it('a mensagem de falha aponta o caminho de retomada', async () => {
    const { buscar } = servidorFalso([respostaErro(503)])

    await expect(cliente({ buscar }).gerar(MENSAGENS)).rejects.toThrow(/Tentar novamente/)
  })
})
