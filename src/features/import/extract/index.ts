import { extrairJobPosting, type DadosEstruturados } from './json-ld'
import {
  documentoDe,
  extrairPrincipal,
  htmlParaMarkdown,
  MINIMO_DE_TEXTO,
  normalizarMarkdown,
  textoVisivel,
} from './markdown'

/**
 * Cascata do adapter genérico (doc 05, etapa 2): JSON-LD → Readability →
 * falha explicada. Para na primeira que funcionar.
 *
 * Os dois primeiros passos não competem: quando há JSON-LD, seus campos
 * estruturados valem mais que qualquer inferência, e o Markdown vem da
 * descrição dele. O Readability entra quando não há JSON-LD — ou quando ele
 * existe mas veio sem descrição.
 */

/** Teto de conteúdo enviado à IA (doc 05). Acima disso o prompt fica caro sem ganho. */
export const LIMITE_DE_CARACTERES = 20_000

export type MotivoDeExtracao = 'pagina_exige_js' | 'sem_conteudo'

export class FalhaDeExtracao extends Error {
  constructor(
    readonly motivo: MotivoDeExtracao,
    message: string,
  ) {
    super(message)
    this.name = 'FalhaDeExtracao'
  }
}

/** Vai para `job_imports.source_site` e para o painel de observabilidade. */
export type OrigemDoConteudo =
  'json-ld' | 'readability' | 'greenhouse' | 'lever' | 'ashby' | 'gupy'

export type ConteudoExtraido = {
  markdown: string
  estruturado: DadosEstruturados | null
  origem: OrigemDoConteudo
  truncado: boolean
}

const CABECALHOS_DE_REQUISITOS =
  /^#{1,6}\s*(requisitos|requirements|qualifica(ç|c)(õ|o)es|qualifications|o que (voc(ê|e) )?precisa|what you.ll need)/im

/**
 * Trunca preservando o começo e, se der, a seção de requisitos (doc 05) — é
 * ela que carrega as tecnologias, que é o que a classificação mais precisa.
 */
export function truncar(markdown: string, limite = LIMITE_DE_CARACTERES): string {
  if (markdown.length <= limite) return markdown

  const requisitos = markdown.match(CABECALHOS_DE_REQUISITOS)
  const inicioDosRequisitos = requisitos?.index

  if (inicioDosRequisitos === undefined || inicioDosRequisitos <= limite) {
    return `${markdown.slice(0, limite).trimEnd()}\n\n[conteúdo truncado]`
  }

  // Um quarto do orçamento fica para os requisitos, o resto para o começo.
  const paraRequisitos = Math.floor(limite / 4)
  const paraInicio = limite - paraRequisitos

  const inicio = markdown.slice(0, paraInicio).trimEnd()
  const trecho = markdown.slice(inicioDosRequisitos, inicioDosRequisitos + paraRequisitos)

  return `${inicio}\n\n[conteúdo truncado]\n\n${trecho.trimEnd()}`
}

export function extrairConteudo(html: string, url?: string): ConteudoExtraido {
  const documento = documentoDe(html, url)
  const estruturado = extrairJobPosting(documento)

  if (estruturado?.descriptionHtml) {
    const markdown = normalizarMarkdown(htmlParaMarkdown(estruturado.descriptionHtml))
    if (markdown.length > 0) {
      return {
        markdown: truncar(markdown),
        estruturado,
        origem: 'json-ld',
        truncado: markdown.length > LIMITE_DE_CARACTERES,
      }
    }
  }

  const principal = extrairPrincipal(html, url)
  if (principal && principal.markdown.length > 0) {
    // O Readability tira o `<h1>` do corpo e devolve como título à parte. Sem
    // reconduzi-lo, o Markdown enviado ao modelo chega sem o nome do cargo —
    // que é o campo mais importante da extração.
    const markdown = principal.titulo
      ? `# ${principal.titulo}\n\n${principal.markdown}`
      : principal.markdown

    return {
      markdown: truncar(markdown),
      estruturado,
      origem: 'readability',
      truncado: markdown.length > LIMITE_DE_CARACTERES,
    }
  }

  // Nada de conteúdo: distinguir "exige JavaScript" de "página vazia" importa,
  // porque a orientação ao admin muda — no primeiro caso existe um link do ATS
  // que funciona.
  const visivel = textoVisivel(documentoDe(html, url))
  if (visivel.length < MINIMO_DE_TEXTO) {
    throw new FalhaDeExtracao(
      'pagina_exige_js',
      'Esta página monta o conteúdo com JavaScript. Use o link direto do sistema de vagas da empresa.',
    )
  }

  throw new FalhaDeExtracao(
    'sem_conteudo',
    'Não encontramos o texto da vaga nesta página.',
  )
}

export { extrairJobPosting, type DadosEstruturados } from './json-ld'
export { MINIMO_DE_TEXTO } from './markdown'
