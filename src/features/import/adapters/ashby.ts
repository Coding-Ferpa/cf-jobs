import { LIMITE_DE_CARACTERES, truncar, type ConteudoExtraido } from '../extract'
import { htmlParaMarkdown } from '../extract/markdown'

import { FalhaDoAdapter, segmentos, type Adapter } from './types'

/**
 * Ashby — `jobs.ashbyhq.com/{org}/{id}` (doc 05).
 *
 * Diferente dos outros, a API pública do Ashby devolve o **quadro inteiro**,
 * não uma vaga: a filtragem pelo id da URL acontece aqui. Se o id não estiver
 * na lista, a vaga saiu do ar — e isso merece mensagem própria, porque
 * "não encontrada" e "erro de rede" pedem reações diferentes de quem importa.
 */

type VagaDoAshby = {
  id?: unknown
  title?: unknown
  location?: unknown
  employmentType?: unknown
  descriptionHtml?: unknown
  descriptionPlain?: unknown
  publishedAt?: unknown
  isRemote?: unknown
  jobUrl?: unknown
  applyUrl?: unknown
  address?: {
    postalAddress?: {
      addressLocality?: unknown
      addressRegion?: unknown
      addressCountry?: unknown
    }
  }
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null
}

export const ashby: Adapter = {
  nome: 'ashby',

  detecta(url) {
    return url.hostname === 'jobs.ashbyhq.com' && segmentos(url).length >= 2
  },

  urlDeBusca(url) {
    const [org] = segmentos(url)
    return `https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`
  },

  interpretar(corpo, url) {
    let quadro: { jobs?: unknown }
    try {
      quadro = JSON.parse(corpo) as { jobs?: unknown }
    } catch {
      throw new FalhaDoAdapter('ashby', 'A API do Ashby não devolveu JSON.')
    }

    const vagas = Array.isArray(quadro.jobs) ? (quadro.jobs as VagaDoAshby[]) : []
    const id = segmentos(url)[1]
    const vaga = vagas.find((candidata) => texto(candidata.id) === id)

    if (!vaga) {
      throw new FalhaDoAdapter(
        'ashby',
        'Esta vaga não está mais publicada no quadro da empresa.',
      )
    }

    const titulo = texto(vaga.title)
    const descricao = texto(vaga.descriptionHtml)
    const corpoMd = descricao ? htmlParaMarkdown(descricao) : texto(vaga.descriptionPlain)

    if (!corpoMd) throw new FalhaDoAdapter('ashby', 'A vaga voltou sem conteúdo.')

    const markdown = [titulo ? `# ${titulo}` : '', corpoMd].filter(Boolean).join('\n\n')
    const endereco = vaga.address?.postalAddress
    const pais = texto(endereco?.addressCountry)

    return {
      markdown: truncar(markdown),
      estruturado: {
        title: titulo,
        companyName: null,
        descriptionHtml: null,
        employmentType: texto(vaga.employmentType),
        datePosted: texto(vaga.publishedAt)?.slice(0, 10) ?? null,
        validThrough: null,
        remote: vaga.isRemote === true,
        location: endereco
          ? {
              city: texto(endereco.addressLocality),
              state: texto(endereco.addressRegion),
              country: pais && pais.length === 2 ? pais.toUpperCase() : null,
            }
          : texto(vaga.location)
            ? { city: texto(vaga.location), state: null, country: null }
            : null,
        salary: null,
        applyUrl: texto(vaga.applyUrl) ?? texto(vaga.jobUrl) ?? url.toString(),
      },
      origem: 'ashby',
      truncado: markdown.length > LIMITE_DE_CARACTERES,
    } satisfies ConteudoExtraido
  },
}
