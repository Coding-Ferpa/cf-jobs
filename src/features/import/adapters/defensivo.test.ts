import { describe, expect, it } from 'vitest'

import { extrairJobPosting } from '../extract'
import { documentoDe, extrairPrincipal } from '../extract/markdown'

import { ashby, FalhaDoAdapter, greenhouse, gupy, lever } from './index'

/**
 * Os caminhos defensivos dos adapters e do JSON-LD.
 *
 * Eles existem porque cada board escreve o mesmo campo de um jeito, e todos
 * mudam sem avisar. Sem teste, são exatamente o código que ninguém percebe
 * quebrado até uma importação falhar em produção.
 */

const jsonLd = (vaga: Record<string, unknown>) =>
  documentoDe(
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'X', ...vaga })}</script>`,
  )

describe('JSON-LD escrito de formas diferentes', () => {
  it('aceita salário como número em texto', () => {
    const dados = extrairJobPosting(
      jsonLd({ baseSalary: { currency: 'brl', value: { minValue: 'R$ 8000' } } }),
    )

    expect(dados?.salary).toMatchObject({ min: 8000, currency: 'BRL' })
  })

  it('aceita valor único, sem faixa', () => {
    const dados = extrairJobPosting(
      jsonLd({ baseSalary: { value: { value: 10000, unitText: 'YEARLY' } } }),
    )

    expect(dados?.salary).toMatchObject({ min: 10000, max: 10000, period: 'year' })
  })

  it('ignora salário sem valor nenhum', () => {
    expect(
      extrairJobPosting(jsonLd({ baseSalary: { currency: 'BRL' } }))?.salary,
    ).toBeNull()
  })

  it('aceita employmentType em lista', () => {
    expect(
      extrairJobPosting(jsonLd({ employmentType: ['FULL_TIME', 'CONTRACTOR'] }))
        ?.employmentType,
    ).toBe('FULL_TIME')
  })

  it('aceita país como objeto com nome', () => {
    const dados = extrairJobPosting(
      jsonLd({ jobLocation: { address: { addressCountry: { name: 'BR' } } } }),
    )

    expect(dados?.location?.country).toBe('BR')
  })

  it('aceita jobLocation em lista e pega o primeiro', () => {
    const dados = extrairJobPosting(
      jsonLd({
        jobLocation: [
          { address: { addressLocality: 'Recife' } },
          { address: { addressLocality: 'Fortaleza' } },
        ],
      }),
    )

    expect(dados?.location?.city).toBe('Recife')
  })

  it('descarta local sem nenhum campo preenchido', () => {
    expect(
      extrairJobPosting(jsonLd({ jobLocation: { address: {} } }))?.location,
    ).toBeNull()
  })

  it('ignora data que não dá para interpretar', () => {
    expect(
      extrairJobPosting(jsonLd({ datePosted: 'semana que vem' }))?.datePosted,
    ).toBeNull()
  })

  it('ignora bloco de JSON-LD que não é objeto', () => {
    expect(
      extrairJobPosting(documentoDe('<script type="application/ld+json">42</script>')),
    ).toBeNull()
  })
})

describe('adapters diante de resposta torta', () => {
  it('greenhouse sem conteúdo falha explicando', () => {
    expect(() =>
      greenhouse.interpretar(
        '{"title":"X"}',
        new URL('https://boards.greenhouse.io/org/jobs/1'),
      ),
    ).toThrow(FalhaDoAdapter)
  })

  it('lever sem nada aproveitável falha explicando', () => {
    expect(() => lever.interpretar('{}', new URL('https://jobs.lever.co/org/1'))).toThrow(
      FalhaDoAdapter,
    )
  })

  it('lever ignora seção de lista sem conteúdo', () => {
    const conteudo = lever.interpretar(
      JSON.stringify({
        text: 'Vaga',
        descriptionPlain: 'Descrição da vaga com texto suficiente.',
        lists: [{ text: 'Vazia' }, { content: '<p>Sem título</p>' }],
      }),
      new URL('https://jobs.lever.co/org/1'),
    )

    expect(conteudo.markdown).not.toContain('Vazia')
    expect(conteudo.markdown).toContain('Sem título')
  })

  it('lever com JSON inválido falha explicando', () => {
    expect(() =>
      lever.interpretar('não é json', new URL('https://jobs.lever.co/org/1')),
    ).toThrow(FalhaDoAdapter)
  })

  it('ashby cai no texto puro quando não há HTML', () => {
    const conteudo = ashby.interpretar(
      JSON.stringify({
        jobs: [{ id: 'abc', title: 'Vaga', descriptionPlain: 'Texto puro da vaga.' }],
      }),
      new URL('https://jobs.ashbyhq.com/org/abc'),
    )

    expect(conteudo.markdown).toContain('Texto puro da vaga.')
    expect(conteudo.estruturado?.location).toBeNull()
  })

  it('ashby usa o local em texto quando não há endereço estruturado', () => {
    const conteudo = ashby.interpretar(
      JSON.stringify({
        jobs: [
          { id: 'abc', title: 'V', location: 'Porto Alegre', descriptionPlain: 'x' },
        ],
      }),
      new URL('https://jobs.ashbyhq.com/org/abc'),
    )

    expect(conteudo.estruturado?.location).toMatchObject({ city: 'Porto Alegre' })
  })

  it('ashby com JSON inválido falha explicando', () => {
    expect(() =>
      ashby.interpretar('<html/>', new URL('https://jobs.ashbyhq.com/org/abc')),
    ).toThrow(FalhaDoAdapter)
  })

  it('ashby sem conteúdo na vaga encontrada falha explicando', () => {
    expect(() =>
      ashby.interpretar(
        JSON.stringify({ jobs: [{ id: 'abc', title: 'V' }] }),
        new URL('https://jobs.ashbyhq.com/org/abc'),
      ),
    ).toThrow(FalhaDoAdapter)
  })

  it('gupy com __NEXT_DATA__ que não é JSON falha explicando', () => {
    expect(() =>
      gupy.interpretar(
        '<script id="__NEXT_DATA__" type="application/json">{quebrado</script>',
        new URL('https://org.gupy.io/jobs/1'),
      ),
    ).toThrow(FalhaDoAdapter)
  })

  it('gupy com dados sem a vaga falha explicando', () => {
    expect(() =>
      gupy.interpretar(
        '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>',
        new URL('https://org.gupy.io/jobs/1'),
      ),
    ).toThrow(FalhaDoAdapter)
  })

  it('gupy monta só as seções que existem', () => {
    const conteudo = gupy.interpretar(
      `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: { pageProps: { job: { name: 'Vaga', description: '<p>Só isso.</p>' } } },
      })}</script>`,
      new URL('https://org.gupy.io/jobs/1'),
    )

    expect(conteudo.markdown).toContain('## Descrição')
    expect(conteudo.markdown).not.toContain('## Requisitos')
    expect(conteudo.estruturado?.remote).toBe(false)
  })

  it('gupy com vaga vazia falha explicando', () => {
    expect(() =>
      gupy.interpretar(
        `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
          props: { pageProps: { job: {} } },
        })}</script>`,
        new URL('https://org.gupy.io/jobs/1'),
      ),
    ).toThrow(FalhaDoAdapter)
  })
})

describe('extrairPrincipal', () => {
  it('devolve null quando não há artigo nenhum', () => {
    expect(extrairPrincipal('<html><body></body></html>')).toBeNull()
  })
})
