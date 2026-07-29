import { type ClienteNim, type Mensagem, type ResultadoDaChamada } from './nim'
import {
  montarPromptDeReparo,
  montarUserPrompt,
  SYSTEM_PROMPT,
  type ListasDeOpcoes,
} from './prompt'
import { CONFIANCA_MINIMA, vagaClassificadaSchema, type VagaClassificada } from './schema'

/**
 * Classificação da vaga (doc 05, etapa 3), com a validação em camadas que o
 * doc chama de defesa em profundidade:
 *
 * 1. `guided_json` restringe o decoding, quando o modelo suporta.
 * 2. Zod valida o que voltou.
 * 3. Validação semântica: o que o modelo não podia ter escrito não passa.
 * 4. Falhou o parse ou o Zod: um retry de reparo com os erros anexados.
 *
 * A camada 3 **não confere slugs**. Conferir é o trabalho do mapeamento (etapa
 * 4), que consulta o catálogo de verdade — com aliases e semelhança — em vez da
 * lista que foi para o prompt. Fazer o descarte aqui seria ativamente pior: o
 * prompt canônico manda o modelo responder "hybrid", e `hibrido` só é
 * alcançável por alias. Nada inventado chega ao banco de qualquer jeito, porque
 * o mapeamento só emite id que veio do catálogo.
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

type Revisao = { vaga: VagaClassificada; avisos: string[] }

/**
 * Camada semântica. Só duas coisas moram aqui: o que dá para corrigir com
 * certeza, e o que não pode virar vaga de jeito nenhum.
 */
export function revisarSemantica(vaga: VagaClassificada): Revisao {
  const avisos: string[] = []

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

  return { avisos, vaga: { ...vaga, salary } }
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

  const revisada = revisarSemantica(resultado.vaga)

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
