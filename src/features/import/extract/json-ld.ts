/**
 * Leitura do JSON-LD `JobPosting` (doc 05, adapter genérico, passo 1).
 *
 * É a primeira tentativa da cascata porque é a mais confiável: quando existe,
 * traz campos já estruturados pelo próprio board — título, empresa, salário,
 * data — em vez de deixar a IA inferi-los do texto corrido. Greenhouse, Ashby,
 * Gupy e a maioria dos boards embutem.
 *
 * Nada aqui confia no formato: cada campo é lido defensivamente. Um board que
 * escreve `hiringOrganization` como string em vez de objeto não pode derrubar
 * a importação inteira.
 */

export type LocalDaVaga = {
  city: string | null
  state: string | null
  country: string | null
}

export type SalarioDaVaga = {
  min: number | null
  max: number | null
  currency: string | null
  period: 'hour' | 'month' | 'year' | null
}

export type DadosEstruturados = {
  title: string | null
  companyName: string | null
  descriptionHtml: string | null
  employmentType: string | null
  datePosted: string | null
  validThrough: string | null
  remote: boolean
  location: LocalDaVaga | null
  salary: SalarioDaVaga | null
  applyUrl: string | null
}

type Json = Record<string, unknown>

function ehObjeto(valor: unknown): valor is Json {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
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

/** `@type` pode ser string ou lista — os dois aparecem em boards reais. */
function temTipo(no: Json, tipo: string): boolean {
  const declarado = no['@type']
  if (typeof declarado === 'string') return declarado === tipo
  if (Array.isArray(declarado)) return declarado.includes(tipo)
  return false
}

/** Achata `@graph` e listas para procurar o nó de vaga em qualquer profundidade. */
function achatar(valor: unknown, profundidade = 0): Json[] {
  if (profundidade > 4) return []
  if (Array.isArray(valor))
    return valor.flatMap((item) => achatar(item, profundidade + 1))
  if (!ehObjeto(valor)) return []

  const grafo = valor['@graph']
  return grafo ? [valor, ...achatar(grafo, profundidade + 1)] : [valor]
}

function lerData(valor: unknown): string | null {
  const bruto = texto(valor)
  if (!bruto) return null

  // Boards escrevem tanto `2026-07-14` quanto ISO completo; o contrato com a
  // IA e com o banco é a data.
  const data = new Date(bruto)
  return Number.isNaN(data.getTime()) ? null : (data.toISOString().slice(0, 10) ?? null)
}

function lerLocal(valor: unknown): LocalDaVaga | null {
  const primeiro = Array.isArray(valor) ? valor[0] : valor
  if (!ehObjeto(primeiro)) return null

  const endereco = ehObjeto(primeiro.address) ? primeiro.address : primeiro
  const pais = texto(
    ehObjeto(endereco.addressCountry)
      ? endereco.addressCountry.name
      : endereco.addressCountry,
  )

  const local: LocalDaVaga = {
    city: texto(endereco.addressLocality),
    state: texto(endereco.addressRegion),
    // ISO 3166-1 alfa-2 é o contrato do banco; nome de país por extenso fica
    // para a IA normalizar.
    country: pais && pais.length === 2 ? pais.toUpperCase() : null,
  }

  return local.city || local.state || local.country ? local : null
}

const PERIODOS: Record<string, SalarioDaVaga['period']> = {
  HOUR: 'hour',
  HOURLY: 'hour',
  MONTH: 'month',
  MONTHLY: 'month',
  YEAR: 'year',
  YEARLY: 'year',
  ANNUAL: 'year',
}

function lerSalario(valor: unknown): SalarioDaVaga | null {
  if (!ehObjeto(valor)) return null

  const quantidade = ehObjeto(valor.value) ? valor.value : valor
  const unidade = texto(quantidade.unitText)?.toUpperCase() ?? ''

  const salario: SalarioDaVaga = {
    min: numero(quantidade.minValue ?? quantidade.value),
    max: numero(quantidade.maxValue ?? quantidade.value),
    currency: texto(valor.currency ?? quantidade.currency)?.toUpperCase() ?? null,
    period: PERIODOS[unidade] ?? null,
  }

  return salario.min !== null || salario.max !== null ? salario : null
}

function lerEmpresa(valor: unknown): string | null {
  if (ehObjeto(valor)) return texto(valor.name)
  return texto(valor)
}

export function extrairJobPosting(documento: Document): DadosEstruturados | null {
  const blocos = documento.querySelectorAll('script[type="application/ld+json"]')

  for (const bloco of blocos) {
    let conteudo: unknown
    try {
      conteudo = JSON.parse(bloco.textContent ?? '')
    } catch {
      // JSON-LD quebrado é comum o bastante para não valer uma falha: a
      // cascata continua no Readability.
      continue
    }

    const vaga = achatar(conteudo).find((no) => temTipo(no, 'JobPosting'))
    if (!vaga) continue

    const tipoDeLocal = texto(vaga.jobLocationType)?.toUpperCase() ?? ''

    return {
      title: texto(vaga.title),
      companyName: lerEmpresa(vaga.hiringOrganization),
      descriptionHtml: texto(vaga.description),
      employmentType: Array.isArray(vaga.employmentType)
        ? texto(vaga.employmentType[0])
        : texto(vaga.employmentType),
      datePosted: lerData(vaga.datePosted),
      validThrough: lerData(vaga.validThrough),
      remote: tipoDeLocal.includes('TELECOMMUTE'),
      location: lerLocal(vaga.jobLocation),
      salary: lerSalario(vaga.baseSalary),
      applyUrl: texto(vaga.url) ?? texto(vaga.applicationContact),
    }
  }

  return null
}
