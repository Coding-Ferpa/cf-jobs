import { ORCAMENTO_DA_IMPORTACAO_MS } from '@/lib/import-runtime'
import { safeFetch, FalhaDeFetch, type ResultadoDeFetch } from '@/lib/safe-fetch'
import { canonicalizarUrl, hashDaUrl } from '@/lib/source-url'

import { acharAdapter, FalhaDoAdapter } from './adapters'
import { classificar, FalhaDaClassificacao } from './classify'
import { extrairConteudo, FalhaDeExtracao, type ConteudoExtraido } from './extract'
import { mapearTaxonomias, type Catalogo } from './map-taxonomies'
import { FalhaDaIa, type ClienteNim } from './nim'
import type { ListasDeOpcoes } from './prompt'

import type { UsoDaClassificacao } from './classify'
import type { MapeamentoDaVaga } from './map-taxonomies'
import type { VagaClassificada } from './schema'

/**
 * Orquestração da importação (doc 05; sequência no doc 02).
 *
 * ```
 * queued → fetching → extracting → classifying → mapping → review
 *    └────────┴──────────┴─────────────┴───────────→ failed (error_step)
 * ```
 *
 * Duas ideias sustentam o desenho:
 *
 * 1. **Cada etapa é gravada antes de começar.** Quem acompanha a barra de
 *    progresso lê `job_imports.status`; se a função morrer no meio, a linha diz
 *    exatamente onde parou, e é isso que o "Tentar novamente" usa.
 * 2. **O orçamento é conferido entre as etapas.** Ele vem do teto da rota
 *    (`maxDuration`) com margem, em `lib/import-runtime`. Estourar não é bug: é
 *    `failed` retomável, e a retomada não refaz o fetch porque o conteúdo ficou
 *    em cache.
 *
 * O módulo não conhece Next nem Postgres (doc 02): banco e catálogo chegam como
 * portas, e a rede só pelo `safeFetch`.
 */

/**
 * Quanto o pipeline se dá antes de desistir. Deriva do `maxDuration` da rota
 * que o hospeda (doc 02) — quem quiser outro valor passa `orcamentoMs`.
 */
export const ORCAMENTO_DO_PIPELINE_MS = ORCAMENTO_DA_IMPORTACAO_MS

/** Doc 05: 3 tentativas com backoff exponencial e jitter. */
export const TENTATIVAS_DE_FETCH = 3
export const ESPERAS_DE_FETCH_MS = [1_000, 3_000, 9_000]

/** Abaixo disto não vale começar a etapa da IA — ela sozinha pode levar 45s. */
export const ORCAMENTO_MINIMO_PARA_IA_MS = 10_000

export type EtapaDoPipeline =
  'fetching' | 'extracting' | 'classifying' | 'mapping' | 'persisting'

export type ConteudoEmCache = {
  rawContent: string
  sourceSite: string | null
}

export type VagaJaCadastrada = {
  id: string
  slug: string
  title: string
}

export type DadosParaPersistir = {
  importId: string
  url: string
  urlHash: string
  sourceSite: string
  criadoPor: string
  vaga: VagaClassificada
  mapa: MapeamentoDaVaga
  uso: UsoDaClassificacao
  latenciaMs: number
}

export type VagaPersistida = { jobId: string; slug: string }

/**
 * Tudo o que o pipeline precisa do banco. É uma porta e não um import de
 * `db/queries` para o módulo continuar rodando sem Postgres (doc 02) — e
 * porque a etapa 5 é uma transação só, que quem sabe SQL escreve melhor.
 */
export type Repositorio = {
  vagaPorHash(urlHash: string): Promise<VagaJaCadastrada | null>
  conteudoEmCache(urlHash: string): Promise<ConteudoEmCache | null>
  /** Grava a etapa atual — é o que a barra de progresso lê. */
  marcarEtapa(importId: string, status: EtapaDoPipeline): Promise<void>
  /**
   * Encerra a tentativa apontando para a vaga que já existia. Sem isto a linha
   * ficaria em `queued` para sempre e quem acompanha o progresso esperaria por
   * um trabalho que ninguém vai fazer.
   */
  marcarDuplicada(importId: string, vaga: VagaJaCadastrada): Promise<void>
  guardarConteudo(
    importId: string,
    dados: { rawContent: string; sourceSite: string },
  ): Promise<void>
  /** Etapa 5 do doc 05: empresa, vaga, junções, sugestões e o import, juntos. */
  persistir(dados: DadosParaPersistir): Promise<VagaPersistida>
  falhar(
    importId: string,
    dados: { etapa: EtapaDoPipeline; mensagem: string; latenciaMs: number },
  ): Promise<void>
}

export type Portas = {
  repositorio: Repositorio
  catalogo: Catalogo
  /** Recebe o orçamento restante para decidir se cabe um segundo ciclo (doc 05). */
  criarCliente: (orcamentoRestanteMs: () => number) => ClienteNim
  listas: ListasDeOpcoes
  buscar?: (url: string) => Promise<ResultadoDeFetch>
  agora?: () => number
  dormir?: (ms: number) => Promise<void>
  aleatorio?: () => number
  orcamentoMs?: number
}

export type EntradaDoPipeline = {
  importId: string
  url: string
  criadoPor: string
}

export type ResultadoDoPipeline =
  | {
      estado: 'review'
      jobId: string
      slug: string
      avisos: string[]
      baixaConfianca: boolean
    }
  | { estado: 'duplicada'; vaga: VagaJaCadastrada }
  | {
      estado: 'failed'
      etapa: EtapaDoPipeline
      mensagem: string
      /** `false` quando repetir não muda nada — 404, página que exige JS. */
      retomavel: boolean
    }

/** Erro com a etapa embutida: o `catch` de fora não precisa adivinhar. */
class FalhaDaEtapa extends Error {
  constructor(
    readonly etapa: EtapaDoPipeline,
    message: string,
    readonly retomavel = true,
  ) {
    super(message)
    this.name = 'FalhaDaEtapa'
  }
}

function dormirDeVerdade(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

/**
 * Classifica a falha de rede em mensagem para quem colou a URL. O admin não
 * pode fazer nada com "fetch failed", mas pode com "a vaga saiu do ar".
 */
function daFalhaDeFetch(erro: FalhaDeFetch): FalhaDaEtapa {
  if (erro.motivo === 'status_http' && erro.status === 404) {
    return new FalhaDaEtapa(
      'fetching',
      'A vaga não existe mais nesse endereço (404). Confira o link na fonte.',
      false,
    )
  }

  if (erro.motivo === 'host_privado' || erro.motivo === 'esquema_nao_permitido') {
    return new FalhaDaEtapa('fetching', erro.message, false)
  }

  return new FalhaDaEtapa('fetching', erro.message)
}

export async function executarPipeline(
  entrada: EntradaDoPipeline,
  portas: Portas,
): Promise<ResultadoDoPipeline> {
  const agora = portas.agora ?? Date.now
  const dormir = portas.dormir ?? dormirDeVerdade
  const aleatorio = portas.aleatorio ?? Math.random
  const buscar = portas.buscar ?? ((url: string) => safeFetch(url))
  const orcamento = portas.orcamentoMs ?? ORCAMENTO_DO_PIPELINE_MS

  const inicio = agora()
  const decorrido = () => agora() - inicio
  const restante = () => orcamento - decorrido()

  const { repositorio, catalogo, listas } = portas

  const exigirTempo = (etapa: EtapaDoPipeline, minimo: number) => {
    if (restante() < minimo) {
      throw new FalhaDaEtapa(
        etapa,
        'O tempo da importação acabou antes desta etapa. ' +
          'Use "Tentar novamente" — o conteúdo já buscado fica em cache.',
      )
    }
  }

  try {
    // ---- Etapa 1: URL, dedup e cache ------------------------------------
    const urlCanonica = canonicalizarUrl(entrada.url)
    const urlHash = hashDaUrl(entrada.url)

    const jaCadastrada = await repositorio.vagaPorHash(urlHash)
    if (jaCadastrada) {
      await repositorio.marcarDuplicada(entrada.importId, jaCadastrada)
      return { estado: 'duplicada', vaga: jaCadastrada }
    }

    // ---- Etapa 2: aquisição de conteúdo ---------------------------------
    await repositorio.marcarEtapa(entrada.importId, 'fetching')

    const adapter = acharAdapter(new URL(urlCanonica))
    const cache = await repositorio.conteudoEmCache(urlHash)

    let conteudo: ConteudoExtraido
    let sourceSite: string

    if (cache) {
      // Retomada: o conteúdo de até 24h atrás serve, e não se bate no board
      // de novo por nada (doc 05).
      conteudo = lerConteudoGuardado(cache.rawContent)
      sourceSite = cache.sourceSite ?? conteudo.origem
    } else {
      const alvo = adapter ? adapter.urlDeBusca(new URL(urlCanonica)) : urlCanonica
      const resposta = await buscarComRetentativas(alvo, {
        buscar,
        dormir,
        aleatorio,
        restante,
      })

      await repositorio.marcarEtapa(entrada.importId, 'extracting')
      conteudo = interpretar(resposta, adapter, urlCanonica)
      sourceSite = adapter?.nome ?? conteudo.origem

      await repositorio.guardarConteudo(entrada.importId, {
        rawContent: JSON.stringify(conteudo),
        sourceSite,
      })
    }

    // ---- Etapa 3: classificação -----------------------------------------
    exigirTempo('classifying', ORCAMENTO_MINIMO_PARA_IA_MS)
    await repositorio.marcarEtapa(entrada.importId, 'classifying')

    const cliente = portas.criarCliente(restante)
    const classificada = await classificarOuFalhar(cliente, {
      url: urlCanonica,
      conteudo: conteudo.markdown,
      listas,
      ...(conteudo.estruturado ? { estruturado: conteudo.estruturado } : {}),
    })

    // ---- Etapa 4: mapeamento de taxonomias ------------------------------
    await repositorio.marcarEtapa(entrada.importId, 'mapping')
    const mapa = await mapearTaxonomias(classificada.vaga, catalogo)

    // ---- Etapa 5: persistência ------------------------------------------
    const persistida = await repositorio.persistir({
      importId: entrada.importId,
      url: urlCanonica,
      urlHash,
      sourceSite,
      criadoPor: entrada.criadoPor,
      vaga: classificada.vaga,
      mapa,
      uso: classificada.uso,
      latenciaMs: decorrido(),
    })

    return {
      estado: 'review',
      jobId: persistida.jobId,
      slug: persistida.slug,
      // Os dois conjuntos de aviso viram um só: quem revisa quer a lista do
      // que mudou sozinho, não a etapa que mudou.
      avisos: [...classificada.avisos, ...mapa.avisos],
      baixaConfianca: classificada.baixaConfianca,
    }
  } catch (erro) {
    const falha = comoFalhaDaEtapa(erro)

    // Gravar a falha não pode derrubar a Server Action junto: o admin precisa
    // da mensagem mais do que do log.
    try {
      await repositorio.falhar(entrada.importId, {
        etapa: falha.etapa,
        mensagem: falha.message,
        latenciaMs: decorrido(),
      })
    } catch (aoGravar) {
      console.error('[import] falha ao gravar o erro da importação', aoGravar)
    }

    return {
      estado: 'failed',
      etapa: falha.etapa,
      mensagem: falha.message,
      retomavel: falha.retomavel,
    }
  }
}

/** O conteúdo guardado é o `ConteudoExtraido` serializado. */
function lerConteudoGuardado(bruto: string): ConteudoExtraido {
  try {
    const lido = JSON.parse(bruto) as Partial<ConteudoExtraido>
    if (typeof lido.markdown === 'string' && lido.markdown.length > 0) {
      return {
        markdown: lido.markdown,
        estruturado: lido.estruturado ?? null,
        origem: lido.origem ?? 'readability',
        truncado: lido.truncado ?? false,
      }
    }
  } catch {
    // Cache de uma versão anterior do formato: o Markdown cru ainda serve.
  }

  return { markdown: bruto, estruturado: null, origem: 'readability', truncado: false }
}

function interpretar(
  resposta: ResultadoDeFetch,
  adapter: ReturnType<typeof acharAdapter>,
  urlCanonica: string,
): ConteudoExtraido {
  try {
    return adapter
      ? adapter.interpretar(resposta.corpo, new URL(urlCanonica))
      : extrairConteudo(resposta.corpo, resposta.url)
  } catch (erro) {
    if (erro instanceof FalhaDeExtracao) {
      // Página de SPA não melhora em retentativa: o admin precisa de outro link.
      throw new FalhaDaEtapa(
        'extracting',
        erro.message,
        erro.motivo !== 'pagina_exige_js',
      )
    }
    if (erro instanceof FalhaDoAdapter) {
      throw new FalhaDaEtapa('extracting', erro.message)
    }
    throw erro
  }
}

async function classificarOuFalhar(
  cliente: ClienteNim,
  entrada: Parameters<typeof classificar>[1],
) {
  try {
    return await classificar(cliente, entrada)
  } catch (erro) {
    if (erro instanceof FalhaDaIa || erro instanceof FalhaDaClassificacao) {
      throw new FalhaDaEtapa('classifying', erro.message)
    }
    throw erro
  }
}

function comoFalhaDaEtapa(erro: unknown): FalhaDaEtapa {
  if (erro instanceof FalhaDaEtapa) return erro
  if (erro instanceof FalhaDeFetch) return daFalhaDeFetch(erro)

  console.error('[import] erro inesperado no pipeline', erro)
  return new FalhaDaEtapa(
    'persisting',
    'Algo deu errado ao montar a vaga. Tente de novo em instantes.',
  )
}

type OpcoesDeRetentativa = {
  buscar: (url: string) => Promise<ResultadoDeFetch>
  dormir: (ms: number) => Promise<void>
  aleatorio: () => number
  restante: () => number
}

/**
 * Fetch com as 3 tentativas do doc 05 (1s, 3s, 9s com jitter). Duas exceções
 * ao "tenta de novo": 404 não retenta, porque a vaga saiu do ar mesmo; e
 * nenhuma espera acontece se ela não couber no que sobrou do orçamento.
 */
export async function buscarComRetentativas(
  url: string,
  opcoes: OpcoesDeRetentativa,
): Promise<ResultadoDeFetch> {
  let ultima: FalhaDeFetch | undefined

  for (let tentativa = 0; tentativa < TENTATIVAS_DE_FETCH; tentativa += 1) {
    try {
      return await opcoes.buscar(url)
    } catch (erro) {
      if (!(erro instanceof FalhaDeFetch)) throw erro
      ultima = erro

      const naoAdianta =
        erro.status === 404 ||
        erro.motivo === 'host_privado' ||
        erro.motivo === 'esquema_nao_permitido' ||
        erro.motivo === 'credencial_na_url' ||
        erro.motivo === 'porta_nao_permitida' ||
        erro.motivo === 'url_invalida' ||
        erro.motivo === 'tipo_nao_suportado' ||
        erro.motivo === 'resposta_grande_demais'

      if (naoAdianta || tentativa === TENTATIVAS_DE_FETCH - 1) break

      // Jitter de ±25%: várias importações que falham juntas não voltam juntas.
      const base = ESPERAS_DE_FETCH_MS[tentativa] ?? 1_000
      const espera = Math.round(base * (0.75 + opcoes.aleatorio() * 0.5))

      // Esperar mais do que sobra só empurra a falha para o fim do orçamento.
      if (opcoes.restante() < espera) break

      await opcoes.dormir(espera)
    }
  }

  throw ultima ?? new FalhaDeFetch('rede', 'Não conseguimos buscar a página.')
}
