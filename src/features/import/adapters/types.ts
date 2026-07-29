import type { ConteudoExtraido } from '../extract'

/**
 * Contrato dos adapters de ATS (doc 05, etapa 2).
 *
 * O insight que justifica a existência deles: os principais ATSs expõem API
 * JSON pública. Ler `boards-api.greenhouse.io` devolve título, local e
 * conteúdo em campos nomeados — enquanto raspar `boards.greenhouse.io` depende
 * de um HTML que muda sem aviso.
 *
 * Cada adapter é isolado justamente para que a mudança de formato de um ATS
 * vire uma correção pontual, com uma fixture nova, e não uma investigação no
 * pipeline inteiro (doc 13).
 */
export type Adapter = {
  /** Vai para `job_imports.source_site` e para o painel de observabilidade. */
  nome: string

  /**
   * Reconhece a URL. Confere host **e** caminho: um link de listagem do
   * Greenhouse não é uma vaga, e deixá-lo cair no genérico dá mensagem melhor
   * do que uma chamada de API que responde 404.
   */
  detecta(url: URL): boolean

  /**
   * O que buscar de fato — normalmente a API pública, não a página que a
   * pessoa colou.
   */
  urlDeBusca(url: URL): string

  /** Converte a resposta da API no mesmo formato que a extração genérica. */
  interpretar(corpo: string, url: URL): ConteudoExtraido
}

export class FalhaDoAdapter extends Error {
  constructor(
    readonly adapter: string,
    message: string,
  ) {
    super(message)
    this.name = 'FalhaDoAdapter'
  }
}

export function segmentos(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean)
}
