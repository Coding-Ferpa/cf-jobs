import { describe, expect, it, vi } from 'vitest'

import {
  classificar,
  extrairJson,
  FalhaDaClassificacao,
  revisarSemantica,
} from './classify'
import type { ClienteNim, ResultadoDaChamada } from './nim'
import { montarUserPrompt, SYSTEM_PROMPT, type ListasDeOpcoes } from './prompt'
import { jsonSchemaDaVaga, vagaClassificadaSchema, type VagaClassificada } from './schema'

/**
 * Classificação com o cliente NIM dublado: aqui o que se testa é a validação
 * em camadas do doc 05, não a rede — essa já tem a suíte do `nim.test.ts`.
 */

const LISTAS: ListasDeOpcoes = {
  work_modes: [{ slug: 'remoto', label: 'Remoto' }],
  contract_types: [{ slug: 'clt', label: 'CLT' }],
  seniority_levels: [{ slug: 'pleno', label: 'Pleno' }],
  role_categories: [{ slug: 'backend', label: 'Backend' }],
  technologies: [
    { slug: 'go', label: 'Go', kind: 'language', aliases: ['golang'] },
    { slug: 'postgresql', label: 'PostgreSQL', kind: 'database' },
  ],
  tags: [{ slug: 'fintech', label: 'Fintech' }],
}

function respostaValida(extras: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    title: 'Pessoa Desenvolvedora Backend',
    company_name: 'Aurora Pagamentos',
    summary: 'Vaga de backend com Go e PostgreSQL.',
    description_md: '## Sobre a vaga\n\n'.padEnd(
      140,
      'Conteúdo suficiente para o schema. ',
    ),
    work_mode: 'remoto',
    contract_type: 'clt',
    seniority: 'pleno',
    role_category: 'backend',
    technologies: ['go', 'postgresql'],
    tags: ['fintech'],
    unmatched_terms: [],
    location: { city: 'São Paulo', state: 'SP', country: 'BR' },
    salary: { min: 12000, max: 18000, currency: 'BRL', period: 'month' },
    benefits: ['Plano de saúde'],
    keywords: ['go'],
    language: 'pt-BR',
    posted_at: null,
    confidence: 0.9,
    ...extras,
  })
}

function chamada(texto: string): ResultadoDaChamada {
  return {
    texto,
    modelo: 'modelo-a',
    chave: 0,
    tokensIn: 100,
    tokensOut: 40,
    guidedJson: true,
    tentativas: 1,
    latenciaMs: 1200,
  }
}

function clienteQueResponde(...respostas: string[]): ClienteNim {
  const gerar = vi.fn()
  for (const resposta of respostas) gerar.mockResolvedValueOnce(chamada(resposta))
  return { gerar } as unknown as ClienteNim
}

const ENTRADA = {
  url: 'https://boards.greenhouse.io/aurora/jobs/1',
  conteudo: '# Vaga\n\nTexto da vaga.',
  listas: LISTAS,
}

function vaga(extras: Partial<VagaClassificada> = {}): VagaClassificada {
  return { ...vagaClassificadaSchema.parse(JSON.parse(respostaValida())), ...extras }
}

describe('extrairJson', () => {
  it('aceita JSON puro', () => {
    expect(extrairJson('{"a":1}')).toBe('{"a":1}')
  })

  it('descasca a cerca de código que o modelo insiste em usar', () => {
    expect(extrairJson('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('descarta conversa antes e depois do objeto', () => {
    expect(extrairJson('Claro! Aqui está:\n{"a":1}\nEspero ter ajudado.')).toBe('{"a":1}')
  })
})

describe('classificar', () => {
  it('valida a resposta e devolve a vaga com o uso', async () => {
    const resultado = await classificar(clienteQueResponde(respostaValida()), ENTRADA)

    expect(resultado.vaga.title).toBe('Pessoa Desenvolvedora Backend')
    expect(resultado.baixaConfianca).toBe(false)
    expect(resultado.uso).toMatchObject({
      modelo: 'modelo-a',
      tokensIn: 100,
      reparada: false,
    })
  })

  it('manda system e user prompt, nessa ordem', async () => {
    const cliente = clienteQueResponde(respostaValida())
    await classificar(cliente, ENTRADA)

    const mensagens = vi.mocked(cliente.gerar).mock.calls[0]?.[0]
    expect(mensagens?.[0]).toMatchObject({ role: 'system', content: SYSTEM_PROMPT })
    expect(mensagens?.[1]?.content).toContain('LISTAS DE OPÇÕES VÁLIDAS')
  })

  it('repara uma resposta inválida em vez de desistir', async () => {
    const resultado = await classificar(
      clienteQueResponde('não é json', respostaValida()),
      ENTRADA,
    )

    expect(resultado.uso.reparada).toBe(true)
    expect(resultado.vaga.title).toBe('Pessoa Desenvolvedora Backend')
  })

  it('manda no reparo a resposta anterior e os erros do Zod', async () => {
    const cliente = clienteQueResponde('{"title":"x"}', respostaValida())
    await classificar(cliente, ENTRADA)

    const reparo = vi.mocked(cliente.gerar).mock.calls[1]?.[0] ?? []
    const ultima = reparo.at(-1)?.content ?? ''

    expect(reparo.at(-2)).toMatchObject({ role: 'assistant', content: '{"title":"x"}' })
    expect(ultima).toContain('ERROS DE VALIDAÇÃO')
    expect(ultima).toContain('company_name')
  })

  it('desiste depois de um reparo, não fica tentando', async () => {
    const cliente = clienteQueResponde('lixo', 'mais lixo')

    await expect(classificar(cliente, ENTRADA)).rejects.toBeInstanceOf(
      FalhaDaClassificacao,
    )
    expect(cliente.gerar).toHaveBeenCalledTimes(2)
  })

  it('marca baixa confiança sem falhar', async () => {
    const resultado = await classificar(
      clienteQueResponde(respostaValida({ confidence: 0.3 })),
      ENTRADA,
    )

    expect(resultado.baixaConfianca).toBe(true)
    expect(resultado.vaga.title).toBeDefined()
  })
})

describe('revisão semântica', () => {
  it('corrige faixa salarial invertida', () => {
    const revisada = revisarSemantica(
      vaga({ salary: { min: 18000, max: 12000, currency: 'BRL', period: 'month' } }),
    )

    expect(revisada.vaga.salary).toMatchObject({ min: 12000, max: 18000 })
    expect(revisada.avisos.some((aviso) => aviso.includes('invertida'))).toBe(true)
  })

  it('recusa descrição que é o próprio prompt de volta', () => {
    expect(() =>
      revisarSemantica(
        vaga({ description_md: `qualquer coisa REGRAS ABSOLUTAS mais coisa`.repeat(5) }),
      ),
    ).toThrow(FalhaDaClassificacao)
  })

  /**
   * Conferir slug aqui seria pior que não conferir: o prompt canônico do doc 05
   * manda o modelo responder "hybrid", e `hibrido` só é alcançável pelo alias
   * que o mapeamento (etapa 4) consulta. Descartar antes disso apagaria a
   * modalidade de toda vaga importada.
   */
  it('deixa os slugs passarem — quem confere é o mapeamento', () => {
    const revisada = revisarSemantica(
      vaga({ work_mode: 'hybrid', technologies: ['go', 'ReactJS'] }),
    )

    expect(revisada.vaga.work_mode).toBe('hybrid')
    expect(revisada.vaga.technologies).toEqual(['go', 'ReactJS'])
    expect(revisada.avisos).toEqual([])
  })
})

describe('prompt e schema', () => {
  it('leva slugs, rótulos, tipo e sinônimos das tecnologias', () => {
    const prompt = montarUserPrompt({ ...ENTRADA, listas: LISTAS })

    expect(prompt).toContain('go — Go (language) [golang]')
    expect(prompt).toContain('work_modes: remoto')
  })

  it('diz explicitamente quando não há dados estruturados', () => {
    expect(montarUserPrompt({ ...ENTRADA })).toContain('DADOS ESTRUTURADOS JÁ EXTRAÍDOS')
    expect(montarUserPrompt({ ...ENTRADA })).toMatch(/incompletos\): null/)
  })

  it('o JSON Schema do guided_json sai do mesmo Zod que valida', () => {
    const schema = jsonSchemaDaVaga()
    const propriedades = Object.keys((schema.properties ?? {}) as Record<string, unknown>)

    expect(propriedades).toContain('description_md')
    expect(propriedades).toContain('unmatched_terms')
    expect(propriedades).toContain('confidence')
    expect(schema.type).toBe('object')
  })
})
