import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  acharAdapter,
  ashby,
  FalhaDoAdapter,
  greenhouse,
  gupy,
  inhire,
  lever,
} from './index'

/**
 * Cada adapter contra pelo menos duas fixtures (doc 12), sendo uma delas um
 * caso torto de verdade: HTML escapado, vaga fora do quadro, formato mudado.
 *
 * As fixtures reproduzem a **forma** das respostas públicas de cada ATS, com
 * empresas e ids fictícios. A conferência com URLs reais é o último sub-passo
 * do M6.
 */

function fixture(nome: string): string {
  return readFileSync(path.join(__dirname, '..', '__fixtures__', nome), 'utf8')
}

const url = (texto: string) => new URL(texto)

describe('detecção de adapter', () => {
  const casos: [string, string | null][] = [
    ['https://boards.greenhouse.io/auroratech/jobs/4512233', 'greenhouse'],
    ['https://job-boards.greenhouse.io/auroratech/jobs/4599001', 'greenhouse'],
    ['https://jobs.lever.co/maredigital/0f2b91ac', 'lever'],
    ['https://jobs.ashbyhq.com/tucanotech/1f0a77c2', 'ashby'],
    ['https://maredigital.gupy.io/jobs/8811223', 'gupy'],
    ['https://maredigital.gupy.io/job/8811223', 'gupy'],
    ['https://techcorp.inhire.app/vagas/e3689659/engenheira-de-dados', 'inhire'],
    ['https://app.inhire.app/vacancies/e3689659', 'inhire'],
    // Sem adapter: caem na cascata genérica.
    ['https://carreiras.empresa.exemplo.test/vagas/backend', null],
    ['https://boards.greenhouse.io/auroratech', null],
    ['https://www.linkedin.com/jobs/view/123456', null],
  ]

  it.each(casos)('%s → %s', (endereco, esperado) => {
    expect(acharAdapter(url(endereco))?.nome ?? null).toBe(esperado)
  })

  it('não confunde um domínio que só termina parecido', () => {
    expect(acharAdapter(url('https://gupy.io.exemplo.test/jobs/1'))).toBeNull()
  })
})

describe('greenhouse', () => {
  const endereco = url('https://boards.greenhouse.io/auroratech/jobs/4512233')

  it('busca a API pública, não a página', () => {
    expect(greenhouse.urlDeBusca(endereco)).toBe(
      'https://boards-api.greenhouse.io/v1/boards/auroratech/jobs/4512233?content=true',
    )
  })

  it('desescapa o HTML que a API devolve', () => {
    const conteudo = greenhouse.interpretar(fixture('greenhouse-vaga.json'), endereco)

    expect(conteudo.markdown).toContain('## About the role')
    expect(conteudo.markdown).toContain('- Strong experience with Go or Java')
    // O `&amp;` precisa virar `&`, e não `&amp;amp;`.
    expect(conteudo.markdown).toContain('scale & keep them observable')
    expect(conteudo.markdown).not.toContain('&lt;')
  })

  it('leva título, empresa e local para os dados estruturados', () => {
    const conteudo = greenhouse.interpretar(fixture('greenhouse-vaga.json'), endereco)

    expect(conteudo.markdown.startsWith('# Senior Backend Engineer')).toBe(true)
    expect(conteudo.estruturado).toMatchObject({
      companyName: 'Aurora Tech',
      location: { city: 'São Paulo, Brazil' },
      remote: false,
    })
    expect(conteudo.origem).toBe('greenhouse')
  })

  it('reconhece vaga remota pelo texto do local', () => {
    const conteudo = greenhouse.interpretar(
      fixture('greenhouse-sem-local.json'),
      url('https://job-boards.greenhouse.io/aurorateach/jobs/4599001'),
    )

    expect(conteudo.estruturado?.remote).toBe(true)
    expect(conteudo.estruturado?.companyName).toBeNull()
    expect(conteudo.markdown).toContain('Terraform')
  })

  it('falha com mensagem própria quando a API não devolve JSON', () => {
    expect(() => greenhouse.interpretar('<html>erro</html>', endereco)).toThrow(
      FalhaDoAdapter,
    )
  })
})

describe('lever', () => {
  const endereco = url('https://jobs.lever.co/maredigital/0f2b91ac')

  it('busca a API pública', () => {
    expect(lever.urlDeBusca(endereco)).toBe(
      'https://api.lever.co/v0/postings/maredigital/0f2b91ac',
    )
  })

  it('remonta descrição, listas e fechamento na ordem', () => {
    const conteudo = lever.interpretar(fixture('lever-vaga.json'), endereco)

    const posDescricao = conteudo.markdown.indexOf('produto de assinaturas')
    const posRequisitos = conteudo.markdown.indexOf('## Requisitos')
    const posFechamento = conteudo.markdown.indexOf('três etapas')

    expect(posDescricao).toBeGreaterThan(-1)
    expect(posRequisitos).toBeGreaterThan(posDescricao)
    expect(posFechamento).toBeGreaterThan(posRequisitos)
  })

  it('envolve os <li> soltos das listas, que o Lever manda sem <ul>', () => {
    const conteudo = lever.interpretar(fixture('lever-vaga.json'), endereco)

    expect(conteudo.markdown).toContain('- React e TypeScript no dia a dia')
    expect(conteudo.markdown).not.toContain('<li>')
  })

  it('lê modalidade e data de publicação', () => {
    const conteudo = lever.interpretar(fixture('lever-vaga.json'), endereco)

    expect(conteudo.estruturado).toMatchObject({
      employmentType: 'Full-time',
      remote: true,
      datePosted: '2026-07-15',
    })
  })

  it('se vira com vaga que só tem texto puro', () => {
    const conteudo = lever.interpretar(
      fixture('lever-so-texto.json'),
      url('https://jobs.lever.co/verdelog/aa11bb22'),
    )

    expect(conteudo.markdown).toContain('Airflow')
    expect(conteudo.estruturado?.remote).toBe(false)
  })
})

describe('ashby', () => {
  const endereco = url(
    'https://jobs.ashbyhq.com/tucanotech/1f0a77c2-93b8-4d0e-9a2c-6b5e1d8f4477',
  )

  it('busca o quadro inteiro, que é o que a API oferece', () => {
    expect(ashby.urlDeBusca(endereco)).toBe(
      'https://api.ashbyhq.com/posting-api/job-board/tucanotech?includeCompensation=true',
    )
  })

  it('filtra a vaga certa entre as do quadro', () => {
    const conteudo = ashby.interpretar(fixture('ashby-quadro.json'), endereco)

    expect(conteudo.markdown).toContain('# Machine Learning Engineer')
    expect(conteudo.markdown).toContain('PyTorch')
    expect(conteudo.markdown).not.toContain('Product Designer')
  })

  it('lê o endereço estruturado quando ele vem', () => {
    const conteudo = ashby.interpretar(fixture('ashby-quadro.json'), endereco)

    expect(conteudo.estruturado).toMatchObject({
      remote: true,
      datePosted: '2026-07-11',
      location: { city: 'Belo Horizonte', state: 'MG', country: 'BR' },
    })
  })

  it('avisa que a vaga saiu do ar, em vez de erro genérico', () => {
    try {
      ashby.interpretar(fixture('ashby-quadro-sem-a-vaga.json'), endereco)
      expect.unreachable('deveria ter falhado')
    } catch (erro) {
      expect(erro).toBeInstanceOf(FalhaDoAdapter)
      expect((erro as FalhaDoAdapter).message).toContain('não está mais publicada')
    }
  })
})

describe('gupy', () => {
  const endereco = url('https://maredigital.gupy.io/jobs/8811223')

  it('busca a própria página, porque o JSON vem embutido nela', () => {
    expect(gupy.urlDeBusca(endereco)).toBe('https://maredigital.gupy.io/jobs/8811223')
  })

  it('lê a vaga do __NEXT_DATA__ e monta as seções', () => {
    const conteudo = gupy.interpretar(fixture('gupy-vaga.html'), endereco)

    expect(conteudo.markdown).toContain('# Pessoa Desenvolvedora Mobile')
    expect(conteudo.markdown).toContain('## Responsabilidades')
    expect(conteudo.markdown).toContain('## Requisitos')
    expect(conteudo.markdown).toContain('React Native em produção')
  })

  it('lê local e modalidade dos campos estruturados', () => {
    const conteudo = gupy.interpretar(fixture('gupy-vaga.html'), endereco)

    expect(conteudo.estruturado).toMatchObject({
      companyName: 'Maré Digital',
      remote: true,
      datePosted: '2026-07-16',
      location: { city: 'Recife', state: 'Pernambuco', country: 'BR' },
    })
  })

  it('falha explicando quando a Gupy muda o formato da página', () => {
    try {
      gupy.interpretar(fixture('gupy-sem-next-data.html'), endereco)
      expect.unreachable('deveria ter falhado')
    } catch (erro) {
      expect(erro).toBeInstanceOf(FalhaDoAdapter)
      expect((erro as FalhaDoAdapter).message).toContain('dados embutidos')
    }
  })
})

describe('inhire', () => {
  const endereco = url('https://techcorp.inhire.app/vagas/e3689659/engenheira-de-dados')

  it('busca a API pública com o header x-tenant da empresa', () => {
    expect(inhire.urlDeBusca(endereco)).toEqual({
      url: 'https://api.inhire.app/job-posts/public/pages/e3689659',
      headers: {
        'x-tenant': 'techcorp',
      },
    })
  })

  it('lê a vaga do __NEXT_DATA__ e monta as seções', () => {
    const conteudo = inhire.interpretar(fixture('inhire-vaga.html'), endereco)

    expect(conteudo.origem).toBe('inhire')
    expect(conteudo.markdown).toContain('# Engenheira de Dados Sênior')
    expect(conteudo.markdown).toContain('## Responsabilidades')
    expect(conteudo.markdown).toContain('## Requisitos')
    expect(conteudo.markdown).toContain('## Desejáveis e Diferenciais')
    expect(conteudo.markdown).toContain('## Benefícios')
    expect(conteudo.markdown).toContain('Construir pipelines em Python e PySpark')
    expect(conteudo.markdown).toContain('Airflow e Apache Spark')
  })

  it('lê local, modalidade, salário e empresa dos campos estruturados', () => {
    const conteudo = inhire.interpretar(fixture('inhire-vaga.html'), endereco)

    expect(conteudo.estruturado).toMatchObject({
      title: 'Engenheira de Dados Sênior',
      companyName: 'TechCorp',
      remote: true,
      employmentType: 'CLT',
      datePosted: '2026-07-20',
      location: { city: 'São Paulo', state: 'SP', country: 'BR' },
      salary: { min: 14000, max: 18000, currency: 'BRL', period: 'month' },
    })
  })

  it('interpreta payload JSON da API oficial do InHire (displayName, tenantName, local string)', () => {
    const jsonApi = JSON.stringify({
      displayName: 'Analista Salesforce Marketing Cloud (Pleno)',
      tenantName: 'Global System',
      description: '<h1>Descrição</h1><p>Requisitos de Salesforce</p>',
      workplaceType: 'Hybrid',
      location: 'Campinas, SP, BR',
      contractType: ['PJ'],
      publishedAt: '2026-08-21T20:06:00.609Z',
    })

    const conteudo = inhire.interpretar(jsonApi, endereco)
    expect(conteudo.markdown).toContain('# Analista Salesforce Marketing Cloud (Pleno)')
    expect(conteudo.markdown).toContain('Requisitos de Salesforce')
    expect(conteudo.estruturado).toMatchObject({
      title: 'Analista Salesforce Marketing Cloud (Pleno)',
      companyName: 'Global System',
      remote: false,
      employmentType: 'PJ',
      datePosted: '2026-08-21',
      location: { city: 'Campinas', state: 'SP', country: 'BR' },
    })
  })

  it('interpreta JSON direto quando a resposta for JSON em vez de HTML', () => {
    const jsonDireto = JSON.stringify({
      title: 'Tech Lead Backend',
      company: 'Inovação SA',
      description: 'Liderar time de backend',
      workplaceType: 'hybrid',
      city: 'Florianópolis',
      state: 'SC',
      country: 'BR',
      requirements: ['Node.js', 'PostgreSQL'],
    })

    const conteudo = inhire.interpretar(jsonDireto, endereco)
    expect(conteudo.markdown).toContain('# Tech Lead Backend')
    expect(conteudo.markdown).toContain('Node.js')
    expect(conteudo.estruturado?.companyName).toBe('Inovação SA')
  })

  it('falha explicando quando o HTML não contém dados da vaga', () => {
    try {
      inhire.interpretar('<html><body><div id="root"></div></body></html>', endereco)
      expect.unreachable('deveria ter falhado')
    } catch (erro) {
      expect(erro).toBeInstanceOf(FalhaDoAdapter)
      expect((erro as FalhaDoAdapter).message).toContain('sem os dados')
    }
  })
})
