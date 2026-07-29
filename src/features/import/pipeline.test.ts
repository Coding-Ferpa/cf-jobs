import { describe, expect, it, vi } from 'vitest'

import { FalhaDeFetch, type ResultadoDeFetch } from '@/lib/safe-fetch'

import { FalhaDaIa, type ClienteNim } from './nim'
import {
  buscarComRetentativas,
  executarPipeline,
  ORCAMENTO_DO_PIPELINE_MS,
  type Portas,
  type Repositorio,
} from './pipeline'
import type { ListasDeOpcoes } from './prompt'

/**
 * Orquestração com todas as portas dubladas: o que se testa aqui é a máquina
 * de estados — a ordem das etapas, o que vai para `failed`, o que é retomável
 * e o que o orçamento de tempo corta. Rede, IA e banco têm suíte própria.
 */

const LISTAS: ListasDeOpcoes = {
  work_modes: [{ slug: 'remoto', label: 'Remoto' }],
  contract_types: [{ slug: 'clt', label: 'CLT' }],
  seniority_levels: [{ slug: 'pleno', label: 'Pleno' }],
  role_categories: [{ slug: 'backend', label: 'Backend' }],
  technologies: [{ slug: 'go', label: 'Go', kind: 'language' }],
  tags: [],
}

const RESPOSTA_DA_IA = JSON.stringify({
  title: 'Pessoa Desenvolvedora Backend',
  company_name: 'Aurora Pagamentos',
  summary: 'Backend com Go.',
  description_md: 'x'.repeat(140),
  work_mode: 'remoto',
  contract_type: 'clt',
  seniority: 'pleno',
  role_category: 'backend',
  technologies: ['go'],
  tags: [],
  unmatched_terms: [],
  location: { city: 'Recife', state: 'PE', country: 'BR' },
  salary: {},
  benefits: [],
  keywords: [],
  language: 'pt-BR',
  posted_at: null,
  confidence: 0.9,
})

const PAGINA = `<html><body><article><h1>Pessoa Desenvolvedora Backend</h1>
<p>${'Trabalhar com Go e PostgreSQL em uma equipe distribuída. '.repeat(20)}</p>
</article></body></html>`

function respostaDeFetch(corpo = PAGINA): ResultadoDeFetch {
  return {
    url: 'https://carreiras.exemplo.test/vagas/backend',
    status: 200,
    contentType: 'text/html',
    corpo,
  }
}

function repositorioFalso(sobrescritas: Partial<Repositorio> = {}): Repositorio {
  return {
    vagaPorHash: vi.fn(async () => null),
    conteudoEmCache: vi.fn(async () => null),
    marcarEtapa: vi.fn(async () => {}),
    marcarDuplicada: vi.fn(async () => {}),
    guardarConteudo: vi.fn(async () => {}),
    persistir: vi.fn(async () => ({ jobId: 'vaga-1', slug: 'backend-aurora-a1b2c3' })),
    falhar: vi.fn(async () => {}),
    ...sobrescritas,
  }
}

function clienteQueResponde(...respostas: (string | Error)[]): ClienteNim {
  const gerar = vi.fn()
  for (const resposta of respostas) {
    if (resposta instanceof Error) gerar.mockRejectedValueOnce(resposta)
    else {
      gerar.mockResolvedValueOnce({
        texto: resposta,
        modelo: 'modelo-a',
        chave: 0,
        tokensIn: 5_000,
        tokensOut: 900,
        guidedJson: true,
        tentativas: 1,
        latenciaMs: 4_000,
      })
    }
  }
  return { gerar } as unknown as ClienteNim
}

function portasDe(sobrescritas: Partial<Portas> = {}): Portas {
  return {
    repositorio: repositorioFalso(),
    catalogo: {
      resolver: async (_tipo, termos) =>
        termos.map((termo) => ({
          termo,
          id: `id-${termo}`,
          slug: termo,
          label: termo,
          via: 'exato' as const,
        })),
    },
    criarCliente: () => clienteQueResponde(RESPOSTA_DA_IA),
    listas: LISTAS,
    buscar: vi.fn(async () => respostaDeFetch()),
    dormir: vi.fn(async () => {}),
    aleatorio: () => 0.5,
    ...sobrescritas,
  }
}

const ENTRADA = {
  importId: 'import-1',
  url: 'https://carreiras.exemplo.test/vagas/backend?utm_source=discord',
  criadoPor: 'usuario-1',
}

describe('executarPipeline — caminho feliz', () => {
  it('percorre as etapas na ordem e devolve a vaga em revisão', async () => {
    const repositorio = repositorioFalso()
    const resultado = await executarPipeline(ENTRADA, portasDe({ repositorio }))

    expect(resultado).toMatchObject({
      estado: 'review',
      jobId: 'vaga-1',
      slug: 'backend-aurora-a1b2c3',
      baixaConfianca: false,
    })

    expect(vi.mocked(repositorio.marcarEtapa).mock.calls.map((c) => c[1])).toEqual([
      'fetching',
      'extracting',
      'classifying',
      'mapping',
    ])
  })

  it('busca a URL canônica, sem os parâmetros de campanha', async () => {
    const buscar = vi.fn(async () => respostaDeFetch())
    await executarPipeline(ENTRADA, portasDe({ buscar }))

    expect(buscar).toHaveBeenCalledWith('https://carreiras.exemplo.test/vagas/backend')
  })

  it('persiste com o que a classificação e o mapeamento produziram', async () => {
    const repositorio = repositorioFalso()
    await executarPipeline(ENTRADA, portasDe({ repositorio }))

    const dados = vi.mocked(repositorio.persistir).mock.calls[0]?.[0]
    expect(dados).toMatchObject({
      importId: 'import-1',
      criadoPor: 'usuario-1',
      sourceSite: 'readability',
    })
    expect(dados?.vaga.title).toBe('Pessoa Desenvolvedora Backend')
    expect(dados?.mapa.technologyIds).toEqual(['id-go'])
    expect(dados?.uso.tokensIn).toBe(5_000)
  })

  it('guarda o conteúdo extraído para a retomada não refazer o fetch', async () => {
    const repositorio = repositorioFalso()
    await executarPipeline(ENTRADA, portasDe({ repositorio }))

    const guardado = vi.mocked(repositorio.guardarConteudo).mock.calls[0]?.[1]
    expect(guardado?.sourceSite).toBe('readability')
    expect(JSON.parse(guardado?.rawContent ?? '{}').markdown).toContain(
      'Pessoa Desenvolvedora Backend',
    )
  })

  it('usa o adapter do ATS quando a URL é de um board conhecido', async () => {
    const buscar = vi.fn(async () => ({
      ...respostaDeFetch(),
      corpo: JSON.stringify({
        id: 42,
        title: 'Backend Engineer',
        content: `<p>${'Conteúdo suficiente da vaga. '.repeat(20)}</p>`,
        location: { name: 'Remote' },
      }),
    }))

    const repositorio = repositorioFalso()
    await executarPipeline(
      {
        ...ENTRADA,
        url: 'https://boards.greenhouse.io/aurora/jobs/42',
      },
      portasDe({ buscar, repositorio }),
    )

    expect(buscar).toHaveBeenCalledWith(
      'https://boards-api.greenhouse.io/v1/boards/aurora/jobs/42?content=true',
    )
    expect(vi.mocked(repositorio.persistir).mock.calls[0]?.[0].sourceSite).toBe(
      'greenhouse',
    )
  })

  it('junta os avisos da classificação e do mapeamento numa lista só', async () => {
    const resultado = await executarPipeline(
      ENTRADA,
      portasDe({
        criarCliente: () =>
          clienteQueResponde(
            JSON.stringify({
              ...JSON.parse(RESPOSTA_DA_IA),
              salary: { min: 18000, max: 12000, currency: 'BRL', period: 'month' },
              technologies: ['go', 'datomic'],
            }),
          ),
        catalogo: {
          resolver: async (_tipo, termos) =>
            termos
              .filter((termo) => termo !== 'datomic')
              .map((termo) => ({
                termo,
                id: `id-${termo}`,
                slug: termo,
                label: termo,
                via: 'exato' as const,
              })),
        },
      }),
    )

    expect(resultado.estado).toBe('review')
    if (resultado.estado !== 'review') return
    expect(resultado.avisos).toContain('A faixa salarial veio invertida e foi corrigida.')
  })
})

describe('executarPipeline — dedup e cache', () => {
  it('para na hora quando a URL já virou vaga', async () => {
    const repositorio = repositorioFalso({
      vagaPorHash: vi.fn(async () => ({
        id: 'vaga-9',
        slug: 'ja-existe-a1b2c3',
        title: 'Já existe',
      })),
    })
    const buscar = vi.fn(async () => respostaDeFetch())

    const resultado = await executarPipeline(ENTRADA, portasDe({ repositorio, buscar }))

    expect(resultado).toMatchObject({ estado: 'duplicada' })
    expect(buscar).not.toHaveBeenCalled()
    expect(repositorio.marcarEtapa).not.toHaveBeenCalled()

    // Ninguém espera o retorno: o pipeline roda em segundo plano (doc 02), e
    // quem acompanha lê a linha. Sem esta marcação ela ficaria em `queued` e a
    // barra de progresso esperaria por um trabalho que já acabou.
    expect(repositorio.marcarDuplicada).toHaveBeenCalledWith(
      ENTRADA.importId,
      expect.objectContaining({ id: 'vaga-9', slug: 'ja-existe-a1b2c3' }),
    )
  })

  it('retoma do cache sem bater no board de novo', async () => {
    const repositorio = repositorioFalso({
      conteudoEmCache: vi.fn(async () => ({
        rawContent: JSON.stringify({
          markdown: '# Vaga em cache\n\nConteúdo guardado.',
          estruturado: null,
          origem: 'json-ld',
          truncado: false,
        }),
        sourceSite: 'lever',
      })),
    })
    const buscar = vi.fn(async () => respostaDeFetch())

    const resultado = await executarPipeline(ENTRADA, portasDe({ repositorio, buscar }))

    expect(resultado.estado).toBe('review')
    expect(buscar).not.toHaveBeenCalled()
    expect(repositorio.guardarConteudo).not.toHaveBeenCalled()
    expect(vi.mocked(repositorio.persistir).mock.calls[0]?.[0].sourceSite).toBe('lever')
  })

  it('aceita cache gravado como Markdown puro, de antes do formato atual', async () => {
    const repositorio = repositorioFalso({
      conteudoEmCache: vi.fn(async () => ({
        rawContent: '# Vaga\n\nMarkdown cru, sem envelope.',
        sourceSite: null,
      })),
    })

    const resultado = await executarPipeline(ENTRADA, portasDe({ repositorio }))

    expect(resultado.estado).toBe('review')
  })
})

describe('executarPipeline — falhas', () => {
  it('grava a etapa e a mensagem quando o fetch falha', async () => {
    const repositorio = repositorioFalso()
    const resultado = await executarPipeline(
      ENTRADA,
      portasDe({
        repositorio,
        buscar: vi.fn(async () => {
          throw new FalhaDeFetch('status_http', 'A página respondeu 500.', 500)
        }),
      }),
    )

    expect(resultado).toMatchObject({
      estado: 'failed',
      etapa: 'fetching',
      retomavel: true,
    })
    expect(repositorio.falhar).toHaveBeenCalledWith('import-1', {
      etapa: 'fetching',
      mensagem: 'A página respondeu 500.',
      latenciaMs: expect.any(Number),
    })
  })

  it('404 não é retomável — a vaga saiu do ar', async () => {
    const resultado = await executarPipeline(
      ENTRADA,
      portasDe({
        buscar: vi.fn(async () => {
          throw new FalhaDeFetch('status_http', 'Não encontrada.', 404)
        }),
      }),
    )

    expect(resultado).toMatchObject({ estado: 'failed', retomavel: false })
    if (resultado.estado !== 'failed') return
    expect(resultado.mensagem).toContain('404')
  })

  it('página que exige JavaScript não é retomável e orienta o admin', async () => {
    const resultado = await executarPipeline(
      ENTRADA,
      portasDe({
        buscar: vi.fn(async () => respostaDeFetch('<html><body></body></html>')),
      }),
    )

    expect(resultado).toMatchObject({
      estado: 'failed',
      etapa: 'extracting',
      retomavel: false,
    })
    if (resultado.estado !== 'failed') return
    expect(resultado.mensagem).toContain('sistema de vagas da empresa')
  })

  it('falha da IA vira failed em classifying, retomável do cache', async () => {
    const repositorio = repositorioFalso()
    const resultado = await executarPipeline(
      ENTRADA,
      portasDe({
        repositorio,
        criarCliente: () =>
          ({
            gerar: vi.fn(async () => {
              throw new FalhaDaIa('cascata_esgotada', 'Os três modelos falharam.')
            }),
          }) as unknown as ClienteNim,
      }),
    )

    expect(resultado).toMatchObject({
      estado: 'failed',
      etapa: 'classifying',
      retomavel: true,
    })
    // O conteúdo já está guardado: a retomada não refaz o fetch.
    expect(repositorio.guardarConteudo).toHaveBeenCalled()
  })

  it('erro inesperado não vaza — vira failed com mensagem apresentável', async () => {
    const repositorio = repositorioFalso({
      persistir: vi.fn(async () => {
        throw new Error('deadlock detected')
      }),
    })

    const resultado = await executarPipeline(ENTRADA, portasDe({ repositorio }))

    expect(resultado).toMatchObject({ estado: 'failed', etapa: 'persisting' })
    if (resultado.estado !== 'failed') return
    expect(resultado.mensagem).not.toContain('deadlock')
  })

  it('falha ao gravar o erro não derruba a resposta ao admin', async () => {
    const repositorio = repositorioFalso({
      falhar: vi.fn(async () => {
        throw new Error('banco fora do ar')
      }),
    })

    const resultado = await executarPipeline(
      ENTRADA,
      portasDe({
        repositorio,
        buscar: vi.fn(async () => {
          throw new FalhaDeFetch('rede', 'Sem conexão.')
        }),
      }),
    )

    expect(resultado).toMatchObject({ estado: 'failed', etapa: 'fetching' })
  })
})

describe('executarPipeline — orçamento de tempo', () => {
  it('não começa a IA quando o tempo restante não comporta', async () => {
    let relogio = 0
    const repositorio = repositorioFalso()

    const resultado = await executarPipeline(
      ENTRADA,
      portasDe({
        repositorio,
        // O fetch consome quase todo o orçamento.
        buscar: vi.fn(async () => {
          relogio += ORCAMENTO_DO_PIPELINE_MS - 2_000
          return respostaDeFetch()
        }),
        agora: () => relogio,
      }),
    )

    expect(resultado).toMatchObject({ estado: 'failed', etapa: 'classifying' })
    if (resultado.estado !== 'failed') return
    expect(resultado.mensagem).toContain('Tentar novamente')
  })

  it('entrega o orçamento restante ao cliente da IA', async () => {
    let relogio = 0
    const criarCliente = vi.fn<Portas['criarCliente']>(() =>
      clienteQueResponde(RESPOSTA_DA_IA),
    )

    await executarPipeline(
      ENTRADA,
      portasDe({
        criarCliente,
        buscar: vi.fn(async () => {
          relogio += 5_000
          return respostaDeFetch()
        }),
        agora: () => relogio,
      }),
    )

    const restante = criarCliente.mock.calls[0]?.[0]
    expect(restante?.()).toBe(ORCAMENTO_DO_PIPELINE_MS - 5_000)
  })
})

describe('buscarComRetentativas', () => {
  const dormirNada = () => vi.fn<(ms: number) => Promise<void>>(async () => {})

  const base = {
    dormir: dormirNada(),
    aleatorio: () => 0.5,
    restante: () => 60_000,
  }

  it('devolve na primeira quando dá certo', async () => {
    const buscar = vi.fn(async () => respostaDeFetch())
    await buscarComRetentativas('https://x.test/a', { ...base, buscar })

    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('tenta três vezes com backoff antes de desistir', async () => {
    const buscar = vi.fn(async () => {
      throw new FalhaDeFetch('rede', 'caiu')
    })
    const dormir = dormirNada()

    await expect(
      buscarComRetentativas('https://x.test/a', { ...base, buscar, dormir }),
    ).rejects.toBeInstanceOf(FalhaDeFetch)

    expect(buscar).toHaveBeenCalledTimes(3)
    // 1s e 3s com jitter neutro (aleatorio = 0.5 → fator 1).
    expect(dormir.mock.calls.map((chamada) => chamada[0])).toEqual([1_000, 3_000])
  })

  it('não retenta 404', async () => {
    const buscar = vi.fn(async () => {
      throw new FalhaDeFetch('status_http', 'sumiu', 404)
    })

    await expect(
      buscarComRetentativas('https://x.test/a', { ...base, buscar }),
    ).rejects.toBeInstanceOf(FalhaDeFetch)
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('não retenta o que a trava anti-SSRF recusou', async () => {
    const buscar = vi.fn(async () => {
      throw new FalhaDeFetch('host_privado', 'endereço interno')
    })

    await expect(
      buscarComRetentativas('https://x.test/a', { ...base, buscar }),
    ).rejects.toBeInstanceOf(FalhaDeFetch)
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('não espera mais do que sobra do orçamento', async () => {
    const buscar = vi.fn(async () => {
      throw new FalhaDeFetch('rede', 'caiu')
    })
    const dormir = dormirNada()

    await expect(
      buscarComRetentativas('https://x.test/a', {
        ...base,
        buscar,
        dormir,
        restante: () => 500,
      }),
    ).rejects.toBeInstanceOf(FalhaDeFetch)

    expect(dormir).not.toHaveBeenCalled()
    expect(buscar).toHaveBeenCalledTimes(1)
  })
})
