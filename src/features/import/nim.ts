import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { APICallError, generateText, type JSONValue } from 'ai'

/**
 * Cliente do NVIDIA NIM (doc 05, etapa 3).
 *
 * Três coisas moram aqui, e nenhuma delas cabe na SDK:
 *
 * 1. **Rodízio de chaves.** Cada conta gratuita tem 40 req/min; alternar as
 *    duas a cada chamada dobra a folga. Em `429`/`401` a chamada seguinte já
 *    sai pela outra — que é o comportamento que o doc 05 pede.
 * 2. **Cascata de modelos.** Primário → secundário → terciário, com a
 *    tentativa registrada para o painel.
 * 3. **Decoding restrito verificado empiricamente.** O suporte varia por
 *    modelo e não há como consultar: manda-se uma vez, e a resposta ensina. A
 *    flag fica em memória do processo — errar para "tem suporte" custa uma
 *    repetição, errar para "não tem" custa qualidade em toda chamada seguinte.
 *
 * O recurso enviado é `response_format: json_schema`, e não o
 * `nvext.guided_json` que o doc 05 nomeia: medido com as chaves reais, o
 * `guided_json` não existe mais no endpoint, e o `response_format` faz o mesmo
 * efeito nos modelos disponíveis ([ADR-0017](../../../docs/adr/0017-response-format-no-lugar-de-nvext-guided-json.md)).
 */

export const ENDPOINT = 'https://integrate.api.nvidia.com/v1'
export const TIMEOUT_POR_CHAMADA_MS = 45_000
export const TENTATIVAS_POR_MODELO = 2
export const ESPERA_MINIMA_MS = 15_000
export const ESPERA_MAXIMA_MS = 30_000
/** Abaixo disto não há tempo para outro ciclo inteiro (doc 05). */
export const ORCAMENTO_PARA_SEGUNDO_CICLO_MS = 35_000

/**
 * Reserva para o que vem depois da IA: mapear taxonomias e gravar a vaga.
 * Sem ela, a última chamada consumiria o orçamento inteiro e o pipeline
 * morreria com a resposta na mão.
 */
export const RESERVA_PARA_O_RESTO_MS = 6_000

/** Chamada com menos tempo que isto não vale a ida — o modelo não responde. */
export const MINIMO_POR_CHAMADA_MS = 5_000

export type MotivoDeFalhaDaIa =
  | 'sem_chave'
  | 'limite_de_taxa'
  | 'nao_autorizado'
  | 'timeout'
  | 'erro_do_provedor'
  | 'cascata_esgotada'
  | 'orcamento_de_tempo'

export class FalhaDaIa extends Error {
  constructor(
    readonly motivo: MotivoDeFalhaDaIa,
    message: string,
    readonly modelo?: string,
  ) {
    super(message)
    this.name = 'FalhaDaIa'
  }
}

export type Mensagem = { role: 'system' | 'user' | 'assistant'; content: string }

export type ResultadoDaChamada = {
  texto: string
  modelo: string
  /** Posição da chave no rodízio — vai para o log, nunca a chave em si. */
  chave: number
  tokensIn: number
  tokensOut: number
  guidedJson: boolean
  tentativas: number
  latenciaMs: number
}

export type ConfigDoNim = {
  apiKeys: string[]
  models: [string, string, string]
  /** JSON Schema do `response_format`; ausente desliga a restrição. */
  jsonSchema?: Record<string, unknown>
  baseURL?: string
  /** Injetado nos testes; em produção é o `fetch` da plataforma. */
  buscar?: typeof fetch
  dormir?: (ms: number) => Promise<void>
  agora?: () => number
  aleatorio?: () => number
  /** Quanto sobra do orçamento do pipeline; decide se cabe um segundo ciclo. */
  orcamentoRestanteMs?: () => number
}

function dormirDeVerdade(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

/**
 * Erro de decoding restrito não suportado. O NIM devolve 400 com a reclamação
 * no corpo; a mensagem varia por modelo, então o reconhecimento é por palavra
 * e não por texto exato. `guided_json` e `nvext` seguem na lista porque um
 * endpoint mais antigo ainda pode reclamar por esses nomes.
 */
export function pareceSemSuporteAoSchema(erro: unknown): boolean {
  if (!APICallError.isInstance(erro) || erro.statusCode !== 400) return false

  const corpo = `${erro.responseBody ?? ''} ${erro.message}`.toLowerCase()
  return (
    corpo.includes('response_format') ||
    corpo.includes('json_schema') ||
    corpo.includes('nvext') ||
    corpo.includes('guided_json') ||
    corpo.includes('guided decoding')
  )
}

function statusDe(erro: unknown): number | undefined {
  return APICallError.isInstance(erro) ? erro.statusCode : undefined
}

function ehTimeout(erro: unknown): boolean {
  return (
    erro instanceof Error && (erro.name === 'AbortError' || erro.name === 'TimeoutError')
  )
}

export class ClienteNim {
  /** Posição do rodízio; avança a cada chamada, com ou sem erro. */
  private proximaChave = 0
  private readonly suporteAoSchema = new Map<string, boolean>()

  constructor(private readonly config: ConfigDoNim) {
    if (config.apiKeys.length === 0) {
      throw new FalhaDaIa('sem_chave', 'Nenhuma chave da NVIDIA configurada.')
    }
  }

  /** `undefined` = ainda não testado neste processo. */
  suporte(modelo: string): boolean | undefined {
    return this.suporteAoSchema.get(modelo)
  }

  private girarChave(): { chave: string; indice: number } {
    const indice = this.proximaChave % this.config.apiKeys.length
    this.proximaChave += 1
    return { chave: this.config.apiKeys[indice]!, indice }
  }

  /**
   * Quanto tempo esta chamada pode tomar. Medido em campo: uma passada da
   * cascata com os três modelos leva mais que os 55s do pipeline inteiro, e o
   * teto fixo de 45s por chamada sozinho já não cabe no orçamento. Sem este
   * corte a promessa de "falha retomável antes dos 55s" era só intenção.
   */
  private timeoutDaChamada(): number {
    const restante = this.config.orcamentoRestanteMs?.() ?? Number.POSITIVE_INFINITY
    if (!Number.isFinite(restante)) return TIMEOUT_POR_CHAMADA_MS

    return Math.min(TIMEOUT_POR_CHAMADA_MS, restante - RESERVA_PARA_O_RESTO_MS)
  }

  /** `false` quando não sobra tempo nem para uma chamada mínima. */
  private cabeOutraChamada(): boolean {
    return this.timeoutDaChamada() >= MINIMO_POR_CHAMADA_MS
  }

  private esperaComJitter(): number {
    const aleatorio = (this.config.aleatorio ?? Math.random)()
    return Math.round(
      ESPERA_MINIMA_MS + aleatorio * (ESPERA_MAXIMA_MS - ESPERA_MINIMA_MS),
    )
  }

  private async chamar(
    modelo: string,
    mensagens: Mensagem[],
    comSchema: boolean,
  ): Promise<{ resultado: ResultadoDaChamada; indice: number }> {
    const { chave, indice } = this.girarChave()
    const agora = this.config.agora ?? Date.now
    const inicio = agora()

    const provedor = createOpenAICompatible({
      name: 'nvidia',
      baseURL: this.config.baseURL ?? ENDPOINT,
      apiKey: chave,
      ...(this.config.buscar ? { fetch: this.config.buscar } : {}),
    })

    // A SDK v7 recusa `role: 'system'` dentro de `messages` e exige o texto na
    // opção própria — ela é quem monta a mensagem de sistema no formato de
    // cada provedor. Descoberto pelo E2E: os testes de unidade mockavam a
    // chamada acima desta camada e nunca mandavam um system.
    const instrucoes = mensagens
      .filter((mensagem) => mensagem.role === 'system')
      .map((mensagem) => mensagem.content)
      .join('\n\n')

    const conversa = mensagens.filter((mensagem) => mensagem.role !== 'system')

    const resposta = await generateText({
      model: provedor.chatModel(modelo),
      ...(instrucoes.length > 0 ? { system: instrucoes } : {}),
      messages: conversa,
      temperature: 0.1,
      maxOutputTokens: 2048,
      // A cascata é nossa: o retry da SDK atrapalharia a contagem de tentativas
      // e giraria a chave sem passar por aqui.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(this.timeoutDaChamada()),
      // O provider OpenAI-compatible repassa `providerOptions[name]` para o
      // corpo da requisição — é por aí que o `response_format` chega.
      providerOptions: comSchema
        ? {
            nvidia: {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'vaga', schema: this.config.jsonSchema },
              } as unknown as JSONValue,
            },
          }
        : {},
    })

    return {
      indice,
      resultado: {
        texto: resposta.text,
        modelo,
        chave: indice,
        tokensIn: resposta.usage?.inputTokens ?? 0,
        tokensOut: resposta.usage?.outputTokens ?? 0,
        guidedJson: comSchema,
        tentativas: 1,
        latenciaMs: agora() - inicio,
      },
    }
  }

  /**
   * Uma passada por um modelo, com as tentativas que o doc 05 permite:
   * `429`/`5xx` repetem (a chave já girou), timeout desiste e deixa a cascata
   * seguir para o próximo modelo.
   */
  private async tentarModelo(
    modelo: string,
    mensagens: Mensagem[],
  ): Promise<ResultadoDaChamada> {
    const dormir = this.config.dormir ?? dormirDeVerdade
    let tentativas = 0
    let ultimoErro: unknown

    for (let tentativa = 0; tentativa < TENTATIVAS_POR_MODELO; tentativa += 1) {
      if (!this.cabeOutraChamada()) break

      const quer = Boolean(this.config.jsonSchema) && this.suporte(modelo) !== false

      try {
        tentativas += 1
        const { resultado } = await this.chamar(modelo, mensagens, quer)
        if (quer) this.suporteAoSchema.set(modelo, true)
        return { ...resultado, tentativas }
      } catch (erro) {
        ultimoErro = erro

        // Descoberta do suporte: anota e repete já sem a restrição, sem
        // gastar uma das tentativas de erro real.
        if (quer && pareceSemSuporteAoSchema(erro)) {
          this.suporteAoSchema.set(modelo, false)
          tentativa -= 1
          continue
        }

        if (ehTimeout(erro)) {
          throw new FalhaDaIa(
            'timeout',
            `O modelo ${modelo} não respondeu a tempo.`,
            modelo,
          )
        }

        const status = statusDe(erro)
        if (status === 401 || status === 403) {
          // A chave já girou; a próxima tentativa sai pela outra conta.
          continue
        }
        if (status === 429 || (status !== undefined && status >= 500)) {
          if (tentativa < TENTATIVAS_POR_MODELO - 1) {
            await dormir(1000 * 3 ** tentativa)
          }
          continue
        }

        // Erro que repetir não conserta (400 de prompt, por exemplo).
        break
      }
    }

    const status = statusDe(ultimoErro)
    const motivo: MotivoDeFalhaDaIa =
      status === 429
        ? 'limite_de_taxa'
        : status === 401 || status === 403
          ? 'nao_autorizado'
          : 'erro_do_provedor'

    throw new FalhaDaIa(motivo, `O modelo ${modelo} falhou.`, modelo)
  }

  /**
   * Cascata completa. Esgotados os três modelos, espera de 15–30s com jitter e
   * repete o ciclo **uma única vez** — e só se o orçamento de tempo do
   * pipeline comportar (doc 05). Senão a falha é retomável do cache.
   */
  async gerar(mensagens: Mensagem[]): Promise<ResultadoDaChamada> {
    const dormir = this.config.dormir ?? dormirDeVerdade
    let ultimaFalha: FalhaDaIa | undefined

    for (let ciclo = 0; ciclo < 2; ciclo += 1) {
      for (const modelo of this.config.models) {
        // Conferido antes de cada modelo, e não só entre ciclos: uma passada
        // pelos três já estoura o orçamento do pipeline sozinha.
        if (!this.cabeOutraChamada()) {
          throw new FalhaDaIa(
            'orcamento_de_tempo',
            'O tempo da importação acabou durante a classificação. ' +
              'Use "Tentar novamente" — o conteúdo já buscado fica em cache.',
            ultimaFalha?.modelo,
          )
        }

        try {
          return await this.tentarModelo(modelo, mensagens)
        } catch (erro) {
          ultimaFalha = erro instanceof FalhaDaIa ? erro : undefined
        }
      }

      if (ciclo === 1) break

      const espera = this.esperaComJitter()
      const restante = this.config.orcamentoRestanteMs?.() ?? Number.POSITIVE_INFINITY

      if (restante < ORCAMENTO_PARA_SEGUNDO_CICLO_MS) {
        throw new FalhaDaIa(
          'orcamento_de_tempo',
          'Os três modelos falharam e não sobrou tempo para tentar de novo. ' +
            'Use "Tentar novamente" — o conteúdo já buscado fica em cache.',
        )
      }

      await dormir(espera)
    }

    throw new FalhaDaIa(
      'cascata_esgotada',
      'Os três modelos falharam duas vezes seguidas. ' +
        'Use "Tentar novamente" — o conteúdo já buscado fica em cache.',
      ultimaFalha?.modelo,
    )
  }
}
