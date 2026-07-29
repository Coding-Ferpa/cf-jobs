import { z } from '@/lib/zod'

/**
 * Contrato da resposta do modelo (doc 05, etapa 3).
 *
 * O Zod é a fonte de verdade: o JSON Schema mandado em `nvext.guided_json`
 * sai daqui por `z.toJSONSchema()`, então não há como o que restringe o
 * decoding divergir do que valida a resposta.
 *
 * O parse é tolerante de propósito (`z.object` descarta chave desconhecida em
 * vez de recusar): modelo que inventa um campo a mais não deveria custar uma
 * chamada de reparo, já que o campo simplesmente não é usado.
 */

export const TIPOS_DE_TERMO = ['technology', 'tag', 'role_category'] as const
export const PERIODOS = ['hour', 'month', 'year'] as const

/** Abaixo disto a vaga é criada, mas com alerta de baixa confiança (doc 05). */
export const CONFIANCA_MINIMA = 0.5

const termoNaoMapeado = z.object({
  kind: z.enum(TIPOS_DE_TERMO),
  label: z.string().max(60),
  context: z.string().max(200).nullish(),
})

export const vagaClassificadaSchema = z.object({
  title: z.string().min(3).max(200),
  company_name: z.string().min(1).max(120),
  summary: z.string().max(280),
  description_md: z.string().min(100),

  // Slugs escolhidos entre as listas enviadas no prompt. O schema não os
  // restringe a um enum porque as listas mudam com o cadastro — quem confere
  // se o slug existe mesmo é a validação semântica, depois do parse.
  work_mode: z.string().nullish(),
  contract_type: z.string().nullish(),
  seniority: z.string().nullish(),
  role_category: z.string().nullish(),

  technologies: z.array(z.string()).max(20).default([]),
  tags: z.array(z.string()).max(10).default([]),
  unmatched_terms: z.array(termoNaoMapeado).max(15).default([]),

  location: z
    .object({
      city: z.string().nullish(),
      state: z.string().nullish(),
      country: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .nullish(),
    })
    .default({}),

  salary: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullish(),
      period: z.enum(PERIODOS).nullish(),
    })
    .default({}),

  benefits: z.array(z.string().max(80)).max(25).default([]),
  keywords: z.array(z.string().max(40)).max(15).default([]),
  language: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .default('pt-BR'),
  posted_at: z.iso.date().nullish(),
  confidence: z.number().min(0).max(1),
})

export type VagaClassificada = z.output<typeof vagaClassificadaSchema>
export type TermoNaoMapeado = z.output<typeof termoNaoMapeado>

/**
 * JSON Schema para o `guided_json` do NIM. Gerado do Zod na entrada (`input`)
 * porque é a forma que o modelo precisa produzir — a de saída já tem os
 * defaults aplicados e não descreveria o que se espera dele.
 */
export function jsonSchemaDaVaga(): Record<string, unknown> {
  return z.toJSONSchema(vagaClassificadaSchema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>
}
