import { LIMITE_DE_CARACTERES, truncar, type ConteudoExtraido } from '../extract'
import { htmlParaMarkdown } from '../extract/markdown'

import { FalhaDoAdapter, segmentos, type Adapter } from './types'

/**
 * Lever — `jobs.lever.co/{org}/{id}` (doc 05).
 *
 * A API separa a descrição (`description`) das seções em lista (`lists`:
 * requisitos, responsabilidades, benefícios) e do fechamento (`additional`).
 * Remontar as três na ordem importa: a seção de requisitos é onde estão as
 * tecnologias, e é ela que a classificação mais aproveita.
 */

type SecaoDoLever = { text?: unknown; content?: unknown }

type VagaDoLever = {
  text?: unknown
  description?: unknown
  descriptionPlain?: unknown
  lists?: unknown
  additional?: unknown
  hostedUrl?: unknown
  applyUrl?: unknown
  createdAt?: unknown
  categories?: {
    location?: unknown
    commitment?: unknown
    team?: unknown
    workplaceType?: unknown
  }
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null
}

function secoes(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []

  return valor.flatMap((item: SecaoDoLever) => {
    const conteudo = texto(item?.content)
    if (!conteudo) return []

    const titulo = texto(item?.text)
    // As listas do Lever vêm como `<li>` soltos, sem o `<ul>` em volta.
    const html = conteudo.trimStart().startsWith('<li')
      ? `<ul>${conteudo}</ul>`
      : conteudo

    return [
      [titulo ? `## ${titulo}` : '', htmlParaMarkdown(html)].filter(Boolean).join('\n\n'),
    ]
  })
}

export const lever: Adapter = {
  nome: 'lever',

  detecta(url) {
    return url.hostname === 'jobs.lever.co' && segmentos(url).length >= 2
  },

  urlDeBusca(url) {
    const [org, id] = segmentos(url)
    return `https://api.lever.co/v0/postings/${org}/${id}`
  },

  interpretar(corpo, url) {
    let vaga: VagaDoLever
    try {
      vaga = JSON.parse(corpo) as VagaDoLever
    } catch {
      throw new FalhaDoAdapter('lever', 'A API do Lever não devolveu JSON.')
    }

    const titulo = texto(vaga.text)
    const descricao = texto(vaga.description)
    const partes = [
      titulo ? `# ${titulo}` : '',
      descricao ? htmlParaMarkdown(descricao) : (texto(vaga.descriptionPlain) ?? ''),
      ...secoes(vaga.lists),
      texto(vaga.additional) ? htmlParaMarkdown(String(vaga.additional)) : '',
    ].filter(Boolean)

    if (partes.length === 0) {
      throw new FalhaDoAdapter('lever', 'A vaga voltou sem conteúdo.')
    }

    const markdown = partes.join('\n\n')
    const local = texto(vaga.categories?.location)
    const modalidade = texto(vaga.categories?.workplaceType)

    const criadaEm =
      typeof vaga.createdAt === 'number'
        ? new Date(vaga.createdAt).toISOString().slice(0, 10)
        : null

    return {
      markdown: truncar(markdown),
      estruturado: {
        title: titulo,
        companyName: null,
        descriptionHtml: null,
        employmentType: texto(vaga.categories?.commitment),
        datePosted: criadaEm,
        validThrough: null,
        remote:
          modalidade?.toLowerCase() === 'remote' ||
          (local ? /remote|remoto/i.test(local) : false),
        location: local ? { city: local, state: null, country: null } : null,
        salary: null,
        applyUrl: texto(vaga.applyUrl) ?? texto(vaga.hostedUrl) ?? url.toString(),
      },
      origem: 'lever',
      truncado: markdown.length > LIMITE_DE_CARACTERES,
    } satisfies ConteudoExtraido
  },
}
