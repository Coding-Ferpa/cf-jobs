import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'

/**
 * HTML → Markdown limpo (doc 05, adapter genérico, passo 2).
 *
 * `linkedom` no lugar do JSDOM: o parse acontece dentro de uma função
 * serverless com orçamento de 55s, e o JSDOM carrega um DOM completo que não
 * usamos para nada aqui — o doc 05 admite os dois.
 *
 * O Markdown existe porque é o formato que o modelo lê melhor e que a revisão
 * humana edita: manda a estrutura (títulos, listas) sem o ruído de HTML.
 */

/** Abaixo disto o HTML não tem vaga nenhuma — é casca de SPA (doc 05). */
export const MINIMO_DE_TEXTO = 500

export function documentoDe(html: string, url?: string): Document {
  // A URL entra porque o Readability a usa para resolver links relativos.
  const { document } = parseHTML(html, url)
  return document as unknown as Document
}

/** Texto visível, para a heurística de página que exige JavaScript. */
export function textoVisivel(documento: Document): string {
  for (const ruido of documento.querySelectorAll('script, style, noscript, template')) {
    ruido.remove()
  }
  return (documento.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function conversor(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  })

  // Nada disso é conteúdo de vaga, e tudo isso atrapalha tanto o modelo quanto
  // quem revisa.
  turndown.remove(['script', 'style', 'noscript', 'iframe', 'form', 'nav', 'footer'])

  // O padrão do Turndown escreve `-   item`, com três espaços de recuo. É
  // Markdown válido, mas polui um texto que vai tanto para o prompt quanto
  // para a caixa de edição da revisão — e recuo de 4 espaços em item aninhado
  // ainda flerta com bloco de código.
  turndown.addRule('itemDeLista', {
    filter: 'li',
    replacement(conteudo, node, opcoes) {
      const texto = conteudo
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, '\n  ')

      const pai = node.parentNode as HTMLElement | null
      let marcador = `${opcoes.bulletListMarker} `

      if (pai?.nodeName === 'OL') {
        const inicio = Number(pai.getAttribute('start') ?? 1)
        const indice = Array.prototype.indexOf.call(pai.children, node)
        marcador = `${inicio + indice}. `
      }

      const quebra = node.nextSibling && !/\n$/.test(texto) ? '\n' : ''
      return marcador + texto + quebra
    },
  })

  return turndown
}

export function htmlParaMarkdown(html: string): string {
  return normalizarMarkdown(conversor().turndown(html))
}

/**
 * Espaço em branco de HTML vira ruído em Markdown: três linhas vazias entre
 * seções, espaço à direita, indentação herdada do formatador do board.
 */
export function normalizarMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type ConteudoPrincipal = {
  titulo: string | null
  markdown: string
}

/**
 * Conteúdo principal da página pelo Readability — é ele que separa o anúncio
 * do menu, do rodapé e da lista de "vagas parecidas".
 */
export function extrairPrincipal(html: string, url?: string): ConteudoPrincipal | null {
  const documento = documentoDe(html, url)

  let artigo: { title?: string | null; content?: string | null } | null = null
  try {
    // O Readability muta o documento que recebe; por isso um documento próprio.
    artigo = new Readability(documento as never).parse()
  } catch {
    return null
  }

  if (!artigo?.content) return null

  const markdown = htmlParaMarkdown(artigo.content)
  if (markdown.length === 0) return null

  return { titulo: artigo.title?.trim() || null, markdown }
}
