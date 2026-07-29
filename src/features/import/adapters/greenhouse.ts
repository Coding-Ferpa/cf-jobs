import { LIMITE_DE_CARACTERES, truncar, type ConteudoExtraido } from '../extract'
import { htmlParaMarkdown } from '../extract/markdown'

import { FalhaDoAdapter, segmentos, type Adapter } from './types'

/**
 * Greenhouse — `boards.greenhouse.io/{org}/jobs/{id}` (doc 05).
 *
 * A API pública devolve o conteúdo em `content`, com o HTML **escapado**: vem
 * `&lt;p&gt;` no lugar de `<p>`. Sem desescapar, o Markdown sairia com as
 * tags à mostra e o modelo receberia lixo.
 */

const HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io'])

type VagaDoGreenhouse = {
  title?: unknown
  content?: unknown
  absolute_url?: unknown
  updated_at?: unknown
  location?: { name?: unknown }
  company_name?: unknown
}

function desescapar(html: string): string {
  return (
    html
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&nbsp;', ' ')
      // `&amp;` por último: desfazê-lo antes reintroduziria entidades já tratadas.
      .replaceAll('&amp;', '&')
  )
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null
}

export const greenhouse: Adapter = {
  nome: 'greenhouse',

  detecta(url) {
    const partes = segmentos(url)
    return HOSTS.has(url.hostname) && partes.length >= 3 && partes[1] === 'jobs'
  },

  urlDeBusca(url) {
    const [org, , id] = segmentos(url)
    return `https://boards-api.greenhouse.io/v1/boards/${org}/jobs/${id}?content=true`
  },

  interpretar(corpo, url) {
    let vaga: VagaDoGreenhouse
    try {
      vaga = JSON.parse(corpo) as VagaDoGreenhouse
    } catch {
      throw new FalhaDoAdapter('greenhouse', 'A API do Greenhouse não devolveu JSON.')
    }

    const conteudo = texto(vaga.content)
    if (!conteudo) {
      throw new FalhaDoAdapter('greenhouse', 'A vaga voltou sem conteúdo.')
    }

    const titulo = texto(vaga.title)
    const markdown = [titulo ? `# ${titulo}` : '', htmlParaMarkdown(desescapar(conteudo))]
      .filter(Boolean)
      .join('\n\n')

    const cidade = texto(vaga.location?.name)

    return {
      markdown: truncar(markdown),
      estruturado: {
        title: titulo,
        companyName: texto(vaga.company_name),
        descriptionHtml: null,
        employmentType: null,
        datePosted: null,
        validThrough: null,
        remote: cidade ? /remote|remoto/i.test(cidade) : false,
        // O Greenhouse manda o local como texto livre ("São Paulo, Brazil").
        // Quebrar isso em cidade/estado/país é justamente o que a IA faz bem.
        location: cidade ? { city: cidade, state: null, country: null } : null,
        salary: null,
        applyUrl: texto(vaga.absolute_url) ?? url.toString(),
      },
      origem: 'greenhouse',
      truncado: markdown.length > LIMITE_DE_CARACTERES,
    } satisfies ConteudoExtraido
  },
}
