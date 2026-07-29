import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  extrairConteudo,
  extrairJobPosting,
  FalhaDeExtracao,
  LIMITE_DE_CARACTERES,
  truncar,
} from './index'
import { documentoDe, textoVisivel } from './markdown'

/**
 * Cascata do adapter genérico contra fixtures de HTML (doc 12). Adicionar
 * fixture é o caminho padrão para corrigir bug de parsing: reproduz o caso
 * real, falha, e só então o código muda.
 */

function fixture(nome: string): string {
  return readFileSync(path.join(__dirname, '..', '__fixtures__', nome), 'utf8')
}

const COM_JSON_LD = fixture('generico-com-json-ld.html')
const SEM_JSON_LD = fixture('generico-sem-json-ld.html')
const SPA_VAZIA = fixture('spa-vazia.html')
const JSON_LD_QUEBRADO = fixture('json-ld-quebrado.html')

describe('extrairJobPosting', () => {
  it('lê os campos estruturados do JSON-LD', () => {
    const dados = extrairJobPosting(documentoDe(COM_JSON_LD))

    expect(dados).toMatchObject({
      title: 'Pessoa Desenvolvedora Backend Sênior',
      companyName: 'Aurora Pagamentos',
      employmentType: 'FULL_TIME',
      datePosted: '2026-07-14',
      validThrough: '2026-08-30',
      location: { city: 'São Paulo', state: 'SP', country: 'BR' },
      salary: { min: 15000, max: 22000, currency: 'BRL', period: 'month' },
    })
  })

  it('devolve null quando a página não tem JobPosting', () => {
    expect(extrairJobPosting(documentoDe(SEM_JSON_LD))).toBeNull()
  })

  it('ignora JSON-LD malformado e outros tipos sem quebrar', () => {
    expect(extrairJobPosting(documentoDe(JSON_LD_QUEBRADO))).toBeNull()
  })

  it('aceita JobPosting dentro de @graph', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Empresa' },
        { '@type': 'JobPosting', title: 'Vaga no grafo', hiringOrganization: 'Empresa' },
      ],
    })}</script>`

    expect(extrairJobPosting(documentoDe(html))?.title).toBe('Vaga no grafo')
  })

  it('aceita @type em lista, como alguns boards escrevem', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': ['JobPosting', 'Thing'],
      title: 'Vaga com tipo em lista',
    })}</script>`

    expect(extrairJobPosting(documentoDe(html))?.title).toBe('Vaga com tipo em lista')
  })

  it('não confia no formato de hiringOrganization', () => {
    const comoTexto = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'X',
      hiringOrganization: 'Empresa Como Texto',
    })}</script>`

    expect(extrairJobPosting(documentoDe(comoTexto))?.companyName).toBe(
      'Empresa Como Texto',
    )
  })

  it('descarta país que não é código de duas letras', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'X',
      jobLocation: { address: { addressLocality: 'Lisboa', addressCountry: 'Portugal' } },
    })}</script>`

    const local = extrairJobPosting(documentoDe(html))?.location
    expect(local?.city).toBe('Lisboa')
    expect(local?.country).toBeNull()
  })

  it('marca vaga remota declarada como TELECOMMUTE', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'X',
      jobLocationType: 'TELECOMMUTE',
    })}</script>`

    expect(extrairJobPosting(documentoDe(html))?.remote).toBe(true)
  })
})

describe('extrairConteudo', () => {
  it('prefere o JSON-LD quando ele traz a descrição', () => {
    const conteudo = extrairConteudo(COM_JSON_LD)

    expect(conteudo.origem).toBe('json-ld')
    expect(conteudo.markdown).toContain('## Sobre a vaga')
    expect(conteudo.markdown).toContain('Kubernetes')
    expect(conteudo.estruturado?.companyName).toBe('Aurora Pagamentos')
  })

  it('cai no Readability quando não há JSON-LD', () => {
    const conteudo = extrairConteudo(SEM_JSON_LD, 'https://verde.exemplo.test/vaga')

    expect(conteudo.origem).toBe('readability')
    expect(conteudo.markdown).toContain('Engenheiro de Dados')
    expect(conteudo.markdown).toContain('Airflow')
    expect(conteudo.estruturado).toBeNull()
  })

  it('descarta navegação e rodapé, que não são conteúdo da vaga', () => {
    const conteudo = extrairConteudo(SEM_JSON_LD, 'https://verde.exemplo.test/vaga')

    expect(conteudo.markdown).not.toContain('Política de privacidade')
    expect(conteudo.markdown).not.toContain('Todas as vagas')
  })

  it('cai no Readability quando o JSON-LD está quebrado', () => {
    const conteudo = extrairConteudo(JSON_LD_QUEBRADO)

    expect(conteudo.origem).toBe('readability')
    expect(conteudo.markdown).toContain('React e TypeScript')
  })

  it('falha com orientação quando a página exige JavaScript', () => {
    expect(() => extrairConteudo(SPA_VAZIA)).toThrow(FalhaDeExtracao)

    try {
      extrairConteudo(SPA_VAZIA)
    } catch (erro) {
      expect(erro).toMatchObject({ motivo: 'pagina_exige_js' })
      expect((erro as FalhaDeExtracao).message).toContain('sistema de vagas da empresa')
    }
  })

  it('devolve Markdown, e não HTML', () => {
    const conteudo = extrairConteudo(COM_JSON_LD)

    expect(conteudo.markdown).not.toContain('<h2>')
    expect(conteudo.markdown).not.toContain('<li>')
    expect(conteudo.markdown).toMatch(/^-\s/m)
  })
})

describe('truncar', () => {
  it('não mexe no que cabe', () => {
    expect(truncar('# Vaga curta')).toBe('# Vaga curta')
  })

  it('corta e avisa quando passa do teto', () => {
    const gigante = 'a'.repeat(LIMITE_DE_CARACTERES + 100)
    const cortado = truncar(gigante)

    expect(cortado.length).toBeLessThan(gigante.length)
    expect(cortado).toContain('[conteúdo truncado]')
  })

  it('preserva a seção de requisitos, que é onde estão as tecnologias', () => {
    const markdown = [
      '# Vaga',
      'x'.repeat(LIMITE_DE_CARACTERES),
      '## Requisitos',
      '- Go e Kubernetes',
    ].join('\n\n')

    const cortado = truncar(markdown)

    expect(cortado).toContain('## Requisitos')
    expect(cortado).toContain('Go e Kubernetes')
    expect(cortado.length).toBeLessThanOrEqual(LIMITE_DE_CARACTERES + 60)
  })

  it('reconhece o cabeçalho de requisitos em inglês', () => {
    const markdown = [
      '# Job',
      'x'.repeat(LIMITE_DE_CARACTERES),
      '## Requirements',
      '- Rust',
    ].join('\n\n')

    expect(truncar(markdown)).toContain('## Requirements')
  })
})

describe('textoVisivel', () => {
  it('não conta script nem noscript como conteúdo', () => {
    expect(textoVisivel(documentoDe(SPA_VAZIA)).length).toBeLessThan(80)
  })
})
