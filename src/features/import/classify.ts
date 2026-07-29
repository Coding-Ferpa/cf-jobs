import { type ClienteNim, type Mensagem, type ResultadoDaChamada } from './nim'
import {
  montarPromptDeReparo,
  montarUserPrompt,
  SYSTEM_PROMPT,
  type ListasDeOpcoes,
} from './prompt'
import {
  CONFIANCA_MINIMA,
  vagaClassificadaSchema,
  type TermoNaoMapeado,
  type VagaClassificada,
} from './schema'

/**
 * Classificação da vaga (doc 05, etapa 3), com a validação em camadas que o
 * doc chama de defesa em profundidade:
 *
 * 1. `guided_json` restringe o decoding, quando o modelo suporta.
 * 2. Zod valida o que voltou.
 * 3. Validação semântica: slug que não existe nas listas não vira campo — vira
 *    sugestão para revisão humana. É a trava que impede a IA de inventar
 *    taxonomia, que é requisito do projeto.
 * 4. Falhou o parse ou o Zod: um retry de reparo com os erros anexados.
 *
 * A camada 3 é a que mais pega coisa na prática: o modelo obedece o formato e
 * erra o vocabulário.
 */

export class FalhaDaClassificacao extends Error {
  constructor(
    message: string,
    readonly resposta?: string,
  ) {
    super(message)
    this.name = 'FalhaDaClassificacao'
  }
}

export type UsoDaClassificacao = {
  modelo: string
  tokensIn: number
  tokensOut: number
  tentativas: number
  guidedJson: boolean
  latenciaMs: number
  reparada: boolean
}

export type ResultadoDaClassificacao = {
  vaga: VagaClassificada
  /** `confidence` abaixo do mínimo: cria a vaga, mas com alerta na revisão. */
  baixaConfianca: boolean
  /** O que foi corrigido em silêncio — aparece na tela de revisão. */
  avisos: string[]
  uso: UsoDaClassificacao
}

/**
 * Modelo instruído a responder só JSON às vezes responde com cerca de código
 * mesmo assim. Recortar é mais barato que gastar um reparo com isso.
 */
export function extrairJson(texto: string): string {
  const semCerca = texto
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()

  const inicio = semCerca.indexOf('{')
  const fim = semCerca.lastIndexOf('}')

  return inicio >= 0 && fim > inicio ? semCerca.slice(inicio, fim + 1) : semCerca
}

function conjuntoDeSlugs(lista: ListasDeOpcoes[keyof ListasDeOpcoes]): Set<string> {
  return new Set(lista.map((opcao) => opcao.slug))
}

type Revisao = { vaga: VagaClassificada; avisos: string[] }

/**
 * Camada semântica. Nada aqui derruba a importação: o que não confere é
   movido para a fila de sugestões ou corrigido com aviso, porque a revisão
 * humana é quem decide.
 */
export function revisarSemantica(
  vaga: VagaClassificada,
  listas: ListasDeOpcoes,
): Revisao {
  const avisos: string[] = []
  const naoMapeados: TermoNaoMapeado[] = [...vaga.unmatched_terms]

  const escalar = (
    valor: string | null | undefined,
    lista: ListasDeOpcoes[keyof ListasDeOpcoes],
    campo: string,
  ): string | null => {
    if (!valor) return null
    if (conjuntoDeSlugs(lista).has(valor)) return valor

    avisos.push(`O modelo escolheu "${valor}" em ${campo}, que não está no cadastro.`)
    return null
  }

  const tecnologiasValidas = conjuntoDeSlugs(listas.technologies)
  const technologies = vaga.technologies.filter((slug) => {
    if (tecnologiasValidas.has(slug)) return true
    naoMapeados.push({ kind: 'technology', label: slug, context: null })
    return false
  })

  const tagsValidas = conjuntoDeSlugs(listas.tags)
  const tags = vaga.tags.filter((slug) => {
    if (tagsValidas.has(slug)) return true
    naoMapeados.push({ kind: 'tag', label: slug, context: null })
    return false
  })

  const salary = { ...vaga.salary }
  if (
    typeof salary.min === 'number' &&
    typeof salary.max === 'number' &&
    salary.min > salary.max
  ) {
    // Inversão é engano de leitura, não dado novo: trocar preserva a faixa.
    avisos.push('A faixa salarial veio invertida e foi corrigida.')
    ;[salary.min, salary.max] = [salary.max, salary.min]
  }

  // O modelo às vezes devolve o próprio prompt como descrição quando não
  // entende a página. Isso não pode virar corpo de vaga.
  const descricaoEhOPrompt =
    vaga.description_md.includes('LISTAS DE OPÇÕES VÁLIDAS') ||
    vaga.description_md.includes('REGRAS ABSOLUTAS')

  if (descricaoEhOPrompt) {
    throw new FalhaDaClassificacao(
      'O modelo devolveu o próprio prompt no lugar da descrição da vaga.',
    )
  }

  return {
    avisos,
    vaga: {
      ...vaga,
      work_mode: escalar(vaga.work_mode, listas.work_modes, 'modalidade'),
      contract_type: escalar(vaga.contract_type, listas.contract_types, 'contratação'),
      seniority: escalar(vaga.seniority, listas.seniority_levels, 'senioridade'),
      role_category: escalar(vaga.role_category, listas.role_categories, 'área'),
      technologies,
      tags,
      unmatched_terms: naoMapeados.slice(0, 15),
      salary,
    },
  }
}

function validar(texto: string): { vaga: VagaClassificada } | { erros: string } {
  let bruto: unknown
  try {
    bruto = JSON.parse(extrairJson(texto))
  } catch {
    return { erros: 'A resposta não é um JSON válido.' }
  }

  const validada = vagaClassificadaSchema.safeParse(bruto)
  if (validada.success) return { vaga: validada.data }

  return {
    erros: validada.error.issues
      .map((problema) => `- ${problema.path.join('.') || '(raiz)'}: ${problema.message}`)
      .join('\n'),
  }
}

export type EntradaDaClassificacao = {
  url: string
  conteudo: string
  listas: ListasDeOpcoes
  estruturado?: unknown
}

export async function classificar(
  cliente: ClienteNim,
  entrada: EntradaDaClassificacao,
): Promise<ResultadoDaClassificacao> {
  const mensagens: Mensagem[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: montarUserPrompt(entrada) },
  ]

  let chamada: ResultadoDaChamada = await cliente.gerar(mensagens)
  let resultado = validar(chamada.texto)
  let reparada = false

  if ('erros' in resultado) {
    reparada = true
    const reparo: Mensagem[] = [
      ...mensagens,
      { role: 'assistant', content: chamada.texto },
      {
        role: 'user',
        content: montarPromptDeReparo({
          respostaInvalida: chamada.texto,
          erros: resultado.erros,
        }),
      },
    ]

    const anterior = resultado.erros
    chamada = await cliente.gerar(reparo)
    resultado = validar(chamada.texto)

    if ('erros' in resultado) {
      throw new FalhaDaClassificacao(
        `A resposta do modelo não passou na validação nem depois do reparo.\n${anterior}`,
        chamada.texto,
      )
    }
  }

  const revisada = revisarSemantica(resultado.vaga, entrada.listas)

  return {
    vaga: revisada.vaga,
    avisos: revisada.avisos,
    baixaConfianca: revisada.vaga.confidence < CONFIANCA_MINIMA,
    uso: {
      modelo: chamada.modelo,
      tokensIn: chamada.tokensIn,
      tokensOut: chamada.tokensOut,
      tentativas: chamada.tentativas,
      guidedJson: chamada.guidedJson,
      latenciaMs: chamada.latenciaMs,
      reparada,
    },
  }
}
