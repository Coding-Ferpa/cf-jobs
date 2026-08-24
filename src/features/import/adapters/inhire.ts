import { LIMITE_DE_CARACTERES, truncar, type ConteudoExtraido } from '../extract'
import { documentoDe, htmlParaMarkdown } from '../extract/markdown'

import { FalhaDoAdapter, type Adapter } from './types'

/**
 * InHire — `{org}.inhire.app/vagas/{id}` ou `app.inhire.app/vagas/{id}` (doc 05).
 *
 * O InHire utiliza aplicação Next.js / SPA com dados da vaga embutidos em
 * `<script id="__NEXT_DATA__">` ou estruturas JSON de estado. Ler diretamente
 * os dados embutidos é mais determinístico e evita quebrar com renderização
 * puramente no cliente.
 */

type VagaDoInHire = {
  id?: unknown
  title?: unknown
  name?: unknown
  company?: unknown
  companyName?: unknown
  tenant?: unknown
  tenantName?: unknown
  city?: unknown
  state?: unknown
  country?: unknown
  workplaceType?: unknown
  workModel?: unknown
  modality?: unknown
  contractType?: unknown
  type?: unknown
  employmentType?: unknown
  publishedAt?: unknown
  publishedDate?: unknown
  createdAt?: unknown
  url?: unknown
  jobUrl?: unknown
  applyUrl?: unknown
  description?: unknown
  aboutJob?: unknown
  responsibilities?: unknown
  requirements?: unknown
  prerequisites?: unknown
  differentials?: unknown
  desirable?: unknown
  benefits?: unknown
  salary?:
    | {
        min?: unknown
        max?: unknown
        currency?: unknown
      }
    | unknown
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'string') {
    const limpo = valor.trim()
    return limpo.length > 0 ? limpo : null
  }
  if (typeof valor === 'number') return String(valor)
  return null
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string') {
    const convertido = Number(valor.replace(/[^\d.-]/g, ''))
    return Number.isFinite(convertido) ? convertido : null
  }
  return null
}

function lerData(valor: unknown): string | null {
  if (!valor) return null
  const data =
    typeof valor === 'number'
      ? new Date(valor)
      : new Date(typeof valor === 'string' ? valor.trim() : '')
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10)
}

function achar(valor: unknown, chave: string, profundidade = 0): unknown {
  if (profundidade > 8 || typeof valor !== 'object' || valor === null) return undefined
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achado = achar(item, chave, profundidade + 1)
      if (achado !== undefined) return achado
    }
    return undefined
  }

  const objeto = valor as Record<string, unknown>
  if (chave in objeto && typeof objeto[chave] === 'object' && objeto[chave] !== null) {
    return objeto[chave]
  }

  for (const filho of Object.values(objeto)) {
    const achado = achar(filho, chave, profundidade + 1)
    if (achado !== undefined) return achado
  }

  return undefined
}

function paraListaHtmlOuMarkdown(valor: unknown): string | null {
  if (!valor) return null
  if (typeof valor === 'string') return valor.trim().length > 0 ? valor.trim() : null
  if (Array.isArray(valor)) {
    const itens = valor
      .map((item) => (typeof item === 'string' ? item.trim() : texto(item)))
      .filter(Boolean)
    if (itens.length === 0) return null
    return `<ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul>`
  }
  return null
}

const SECOES: { chaves: (keyof VagaDoInHire)[]; rotulo: string }[] = [
  { chaves: ['description', 'aboutJob'], rotulo: 'Descrição' },
  { chaves: ['responsibilities'], rotulo: 'Responsabilidades' },
  { chaves: ['requirements', 'prerequisites'], rotulo: 'Requisitos' },
  { chaves: ['differentials', 'desirable'], rotulo: 'Desejáveis e Diferenciais' },
  { chaves: ['benefits'], rotulo: 'Benefícios' },
]

export const inhire: Adapter = {
  nome: 'inhire',

  detecta(url) {
    const host = url.hostname.toLowerCase()
    const eInhire =
      host === 'inhire.app' || host === 'app.inhire.app' || host.endsWith('.inhire.app')
    return eInhire && /\/(vagas?|vacanc(y|ies))\//i.test(url.pathname)
  },

  urlDeBusca(url) {
    return url.toString()
  },

  interpretar(corpo, url) {
    let dados: unknown

    // Tentativa 1: HTML com __NEXT_DATA__
    const doc = documentoDe(corpo)
    const blocoNext = doc.querySelector('script#__NEXT_DATA__')?.textContent

    if (blocoNext) {
      try {
        dados = JSON.parse(blocoNext)
      } catch {
        throw new FalhaDoAdapter(
          'inhire',
          'Os dados embutidos do InHire não são JSON válido.',
        )
      }
    } else {
      // Tentativa 2: Corpo já é JSON direto ou outro script de dados
      const blocoJson = doc.querySelector('script[type="application/json"]')?.textContent
      if (blocoJson) {
        try {
          dados = JSON.parse(blocoJson)
        } catch {
          // segue para tentativa direta de JSON
        }
      }

      if (!dados) {
        try {
          dados = JSON.parse(corpo)
        } catch {
          throw new FalhaDoAdapter(
            'inhire',
            'A página do InHire veio sem os dados da vaga embutidos.',
          )
        }
      }
    }

    const vaga = (achar(dados, 'vacancy') ??
      achar(dados, 'job') ??
      (typeof dados === 'object' && dados !== null && 'title' in dados
        ? dados
        : undefined)) as VagaDoInHire | undefined

    if (!vaga) {
      throw new FalhaDoAdapter('inhire', 'Não achamos a vaga nos dados da página.')
    }

    const titulo = texto(vaga.title) ?? texto(vaga.name)
    const partes = [titulo ? `# ${titulo}` : '']

    for (const { chaves, rotulo } of SECOES) {
      for (const chave of chaves) {
        const conteudoBruto = vaga[chave]
        const conteudo = paraListaHtmlOuMarkdown(conteudoBruto)
        if (conteudo) {
          const md = /<[a-z][\s\S]*>/i.test(conteudo)
            ? htmlParaMarkdown(conteudo)
            : conteudo
          if (md.trim().length > 0) {
            partes.push(`## ${rotulo}`, md)
            break
          }
        }
      }
    }

    const markdown = partes.filter(Boolean).join('\n\n')
    if (markdown.length === 0) {
      throw new FalhaDoAdapter('inhire', 'A vaga voltou sem conteúdo.')
    }

    const modalidade = (
      texto(vaga.workplaceType) ??
      texto(vaga.workModel) ??
      texto(vaga.modality) ??
      ''
    ).toLowerCase()

    const eRemoto =
      modalidade.includes('remot') ||
      modalidade === 'remote' ||
      modalidade === 'home_office'

    const pais = texto(vaga.country)
    const salarioObj =
      typeof vaga.salary === 'object' && vaga.salary !== null
        ? (vaga.salary as Record<string, unknown>)
        : null

    const valorDireto = numero(vaga.salary)
    const minSal = numero(salarioObj?.min ?? salarioObj?.value ?? valorDireto)
    const maxSal = numero(salarioObj?.max ?? salarioObj?.value ?? valorDireto)
    const moeda = texto(salarioObj?.currency)

    const empresa =
      texto(vaga.company) ??
      texto(vaga.companyName) ??
      texto(vaga.tenant) ??
      texto(vaga.tenantName)

    return {
      markdown: truncar(markdown),
      estruturado: {
        title: titulo,
        companyName: empresa,
        descriptionHtml: null,
        employmentType:
          texto(vaga.contractType) ?? texto(vaga.type) ?? texto(vaga.employmentType),
        datePosted:
          lerData(vaga.publishedAt) ??
          lerData(vaga.publishedDate) ??
          lerData(vaga.createdAt),
        validThrough: null,
        remote: eRemoto,
        location: {
          city: texto(vaga.city),
          state: texto(vaga.state),
          country: pais && pais.length === 2 ? pais.toUpperCase() : null,
        },
        salary:
          minSal !== null || maxSal !== null
            ? {
                min: minSal,
                max: maxSal,
                currency: moeda && moeda.length === 3 ? moeda.toUpperCase() : 'BRL',
                period: 'month',
              }
            : null,
        applyUrl:
          texto(vaga.applyUrl) ?? texto(vaga.url) ?? texto(vaga.jobUrl) ?? url.toString(),
      },
      origem: 'inhire',
      truncado: markdown.length > LIMITE_DE_CARACTERES,
    } satisfies ConteudoExtraido
  },
}
