import { LIMITE_DE_CARACTERES, truncar, type ConteudoExtraido } from '../extract'
import { documentoDe, htmlParaMarkdown } from '../extract/markdown'

import { FalhaDoAdapter, type Adapter } from './types'

/**
 * Gupy — `{org}.gupy.io/jobs/{id}` (doc 05).
 *
 * A Gupy não publica API de vaga avulsa, mas a página é Next.js e carrega o
 * `__NEXT_DATA__` com a vaga inteira em JSON. Ler dali é mais estável que
 * raspar a marcação — e, quando o formato mudar, a cascata genérica ainda
 * pega o HTML renderizado.
 *
 * É o ATS mais comum no Brasil, então este adapter é o que mais roda.
 */

type VagaDaGupy = {
  name?: unknown
  description?: unknown
  responsibilities?: unknown
  prerequisites?: unknown
  careerPageName?: unknown
  city?: unknown
  state?: unknown
  country?: unknown
  workplaceType?: unknown
  type?: unknown
  publishedDate?: unknown
  jobUrl?: unknown
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null
}

function achar(valor: unknown, chave: string, profundidade = 0): unknown {
  if (profundidade > 8 || typeof valor !== 'object' || valor === null) return undefined
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achado = achar(item, chave, profundidade + 1)
      if (achado !== undefined) return achado
    }
    return undefined
  }

  const objeto = valor as Record<string, unknown>
  if (chave in objeto && typeof objeto[chave] === 'object' && objeto[chave] !== null) {
    return objeto[chave]
  }

  for (const filho of Object.values(objeto)) {
    const achado = achar(filho, chave, profundidade + 1)
    if (achado !== undefined) return achado
  }

  return undefined
}

const SECOES: [keyof VagaDaGupy, string][] = [
  ['description', 'Descrição'],
  ['responsibilities', 'Responsabilidades'],
  ['prerequisites', 'Requisitos'],
]

export const gupy: Adapter = {
  nome: 'gupy',

  detecta(url) {
    return url.hostname.endsWith('.gupy.io') && /\/jobs?\//.test(url.pathname)
  },

  // A própria página: o JSON vem embutido nela.
  urlDeBusca(url) {
    return url.toString()
  },

  interpretar(corpo, url) {
    const bloco = documentoDe(corpo).querySelector('script#__NEXT_DATA__')?.textContent

    if (!bloco) {
      throw new FalhaDoAdapter('gupy', 'A página da Gupy veio sem os dados embutidos.')
    }

    let dados: unknown
    try {
      dados = JSON.parse(bloco)
    } catch {
      throw new FalhaDoAdapter('gupy', 'Os dados embutidos da Gupy não são JSON válido.')
    }

    const vaga = achar(dados, 'job') as VagaDaGupy | undefined
    if (!vaga) throw new FalhaDoAdapter('gupy', 'Não achamos a vaga nos dados da página.')

    const titulo = texto(vaga.name)
    const partes = [titulo ? `# ${titulo}` : '']

    for (const [campo, rotulo] of SECOES) {
      const html = texto(vaga[campo])
      if (html) partes.push(`## ${rotulo}`, htmlParaMarkdown(html))
    }

    const markdown = partes.filter(Boolean).join('\n\n')
    if (markdown.length === 0) {
      throw new FalhaDoAdapter('gupy', 'A vaga voltou sem conteúdo.')
    }

    const modalidade = texto(vaga.workplaceType)?.toLowerCase() ?? ''
    const pais = texto(vaga.country)

    return {
      markdown: truncar(markdown),
      estruturado: {
        title: titulo,
        companyName: texto(vaga.careerPageName),
        descriptionHtml: null,
        employmentType: texto(vaga.type),
        datePosted: texto(vaga.publishedDate)?.slice(0, 10) ?? null,
        validThrough: null,
        remote: modalidade === 'remote' || modalidade === 'remoto',
        location: {
          city: texto(vaga.city),
          state: texto(vaga.state),
          country: pais && pais.length === 2 ? pais.toUpperCase() : null,
        },
        salary: null,
        applyUrl: texto(vaga.jobUrl) ?? url.toString(),
      },
      origem: 'gupy',
      truncado: markdown.length > LIMITE_DE_CARACTERES,
    } satisfies ConteudoExtraido
  },
}
