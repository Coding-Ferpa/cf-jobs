/**
 * Formatação de exibição em pt-BR. Datas do banco são UTC; a apresentação usa
 * America/Sao_Paulo (doc 02).
 */

const FUSO = 'America/Sao_Paulo'

/**
 * As datas chegam como texto ISO da camada de dados (é o que sobrevive à
 * serialização do cache e ao JSON da API). A conversão acontece aqui, no ponto
 * de exibição.
 */
export type DataOuIso = Date | string

function paraDate(valor: DataOuIso): Date {
  return valor instanceof Date ? valor : new Date(valor)
}

export function formatarData(data: DataOuIso): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: FUSO,
  }).format(paraDate(data))
}

const MINUTO = 60_000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

/** "há 3 dias", "hoje" — o card mostra recência, não data exata. */
export function formatarDataRelativa(data: DataOuIso, agora: Date = new Date()): string {
  const diferenca = agora.getTime() - paraDate(data).getTime()

  if (diferenca < HORA) return 'agora há pouco'
  if (diferenca < DIA) {
    const horas = Math.floor(diferenca / HORA)
    return horas === 1 ? 'há 1 hora' : `há ${horas} horas`
  }

  const dias = Math.floor(diferenca / DIA)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`

  const meses = Math.floor(dias / 30)
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`
}

/** Quantos dias faltam para expirar; negativo quando já passou. */
export function diasAteExpirar(expiraEm: DataOuIso, agora: Date = new Date()): number {
  return Math.ceil((paraDate(expiraEm).getTime() - agora.getTime()) / DIA)
}

export type Salario = {
  min: string | null
  max: string | null
  currency: string | null
  period: string
}

const PERIODO = {
  hour: '/hora',
  month: '/mês',
  year: '/ano',
} as const

function moeda(valor: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(valor)
}

/** `null` quando não há faixa: o card simplesmente não mostra salário. */
export function formatarSalario(salario: Salario): string | null {
  const min = salario.min === null ? null : Number(salario.min)
  const max = salario.max === null ? null : Number(salario.max)
  const currency = salario.currency ?? 'BRL'

  if (min === null && max === null) return null

  const sufixo = PERIODO[salario.period as keyof typeof PERIODO] ?? ''

  if (min !== null && max !== null) {
    if (min === max) return `${moeda(min, currency)}${sufixo}`
    return `${moeda(min, currency)} – ${moeda(max, currency)}${sufixo}`
  }

  const valor = min ?? max
  if (valor === null) return null

  return min === null
    ? `até ${moeda(valor, currency)}${sufixo}`
    : `a partir de ${moeda(valor, currency)}${sufixo}`
}

export type Localizacao = {
  city: string | null
  state: string | null
  country: string | null
}

/** Remoto não tem cidade; sem nada informado, não inventamos lugar. */
export function formatarLocalizacao(
  local: Localizacao,
  workModeSlug?: string | null,
): string | null {
  const partes = [local.city, local.state].filter(
    (parte): parte is string => typeof parte === 'string' && parte.length > 0,
  )

  if (partes.length > 0) return partes.join(', ')
  if (workModeSlug === 'remoto') return 'Remoto'
  if (local.country === 'BR') return 'Brasil'
  return local.country
}
