import { z } from 'zod'

import type { JobFilters } from '@/db/queries/jobs'
import { LIMITE_MAXIMO, LIMITE_PADRAO } from '@/lib/cursor'

/**
 * Contrato de query de `GET /api/v1/jobs` (doc 06).
 *
 * Listas chegam em CSV (`?tech=react,go`) porque é o que o doc fixa. Repetir o
 * parâmetro (`?tech=react&tech=go`) resolve no mesmo lugar: quem integra não
 * deveria descobrir por tentativa e erro qual das duas formas vale.
 */

const MAXIMO_DE_VALORES = 20

// As mensagens são escritas à mão porque as embutidas do Zod saem em inglês, e
// o `detail` do Problem Details é texto que uma pessoa lê.
const listaCsv = z
  .string()
  .transform((valor) =>
    valor
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
  .pipe(
    z
      .array(z.string().max(80, 'cada valor deve ter no máximo 80 caracteres.'))
      .max(MAXIMO_DE_VALORES, `aceita no máximo ${MAXIMO_DE_VALORES} valores.`),
  )
  .optional()

const texto = (maximo: number) =>
  z
    .string()
    .trim()
    .min(1, 'não pode ser vazio.')
    .max(maximo, `deve ter no máximo ${maximo} caracteres.`)
    .optional()

// O genérico existe para o tipo de saída continuar sendo a união de literais
// (`'published' | 'archived' | 'all'`) em vez de `string`: é o que faz o
// TypeScript recusar um valor inventado ao montar o filtro do banco.
const lista = <T extends readonly [string, ...string[]]>(valores: T) =>
  z.enum(valores, { error: `aceita apenas ${valores.join(', ')}.` })

export const STATUS = ['published', 'archived', 'all'] as const
export const ORDENACOES = ['recent', 'relevance'] as const

export const consultaDeVagas = z.object({
  q: texto(200),
  tech: listaCsv,
  role: listaCsv,
  seniority: listaCsv,
  work_mode: listaCsv,
  contract_type: listaCsv,
  tag: listaCsv,
  company: listaCsv,
  city: texto(120),
  state: texto(120),
  country: z
    .string()
    .trim()
    .length(2, 'deve ser o código ISO de duas letras do país, como BR.')
    .optional(),
  status: lista(STATUS).default('published'),
  sort: lista(ORDENACOES).default('recent'),
  cursor: z.string().max(500, 'não parece um cursor desta API.').optional(),
  // Passar do teto é erro, não pedido para arredondar: quem pediu 200 precisa
  // saber que recebeu 50, e um 400 conta isso melhor que um silêncio.
  limit: z.coerce
    .number({ error: 'deve ser um número inteiro.' })
    .int('deve ser um número inteiro.')
    .min(1, 'deve ser pelo menos 1.')
    .max(LIMITE_MAXIMO, `deve ser no máximo ${LIMITE_MAXIMO}.`)
    .default(LIMITE_PADRAO),
})

export type ConsultaDeVagas = z.output<typeof consultaDeVagas>

function paraObjeto(params: URLSearchParams): Record<string, string> {
  const objeto: Record<string, string> = {}
  for (const chave of new Set(params.keys())) {
    objeto[chave] = params.getAll(chave).join(',')
  }
  return objeto
}

export function analisarConsulta(params: URLSearchParams) {
  return consultaDeVagas.safeParse(paraObjeto(params))
}

/** Traduz o contrato público (snake_case) para o filtro do banco (camelCase). */
export function paraFiltros(consulta: ConsultaDeVagas): JobFilters {
  return {
    q: consulta.q,
    tech: consulta.tech,
    role: consulta.role,
    seniority: consulta.seniority,
    workMode: consulta.work_mode,
    contractType: consulta.contract_type,
    tag: consulta.tag,
    company: consulta.company,
    city: consulta.city,
    state: consulta.state,
    country: consulta.country,
    status: consulta.status,
    sort: consulta.sort,
    cursor: consulta.cursor ?? null,
    limit: consulta.limit,
  }
}

/** Primeira mensagem legível de um erro de validação, para o `detail`. */
export function primeiroErro(erro: z.ZodError): string {
  const problema = erro.issues.at(0)
  if (!problema) return 'Parâmetros inválidos.'

  const campo = problema.path.join('.')
  return campo ? `Parâmetro "${campo}": ${problema.message}` : problema.message
}
