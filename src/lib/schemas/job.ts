import { z } from 'zod'

/**
 * Schemas do CRUD de vagas (doc 06). Vivem em `lib` e não junto das actions
 * porque o formulário do admin usa exatamente estes objetos no resolver do
 * react-hook-form (doc 08) — validação idêntica no cliente e no servidor, sem
 * duas listas de regras para manter em sincronia.
 *
 * Módulo puro: nada de `server-only` aqui.
 */

export const MOEDAS = ['BRL', 'USD', 'EUR'] as const
export const PERIODOS_DE_SALARIO = ['hour', 'month', 'year'] as const

/** Campo de texto opcional: o formulário manda `''`, o banco quer `null`. */
const textoOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor.length > 0 ? valor : null))
  .nullable()

const uuidOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor.length > 0 ? valor : null))
  .nullable()
  .refine((valor) => valor === null || z.uuid().safeParse(valor).success, {
    message: 'Selecione uma opção válida.',
  })

/** Aceita "12000", "12.000,50" e "12000.50" — o admin digita como fala. */
const dinheiroOpcional = z
  .union([z.string(), z.number()])
  .transform((valor) => {
    const texto = String(valor).trim()
    if (texto.length === 0) return null
    return texto.replace(/\./g, '').replace(',', '.')
  })
  .nullable()
  .refine((valor) => valor === null || /^\d+(\.\d{1,2})?$/.test(valor), {
    message: 'Informe um valor numérico, como 12000 ou 12.000,50.',
  })

/** Lista separada por linha, do jeito que se digita em um textarea. */
const listaPorLinha = z
  .string()
  .default('')
  .transform((valor) =>
    valor
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 0),
  )

export const vagaSchema = z
  .object({
    title: z.string().trim().min(3, 'O título precisa de pelo menos 3 caracteres.'),
    companyId: z.uuid('Escolha a empresa.'),
    descriptionMd: z
      .string()
      .trim()
      .min(50, 'A descrição precisa de pelo menos 50 caracteres.'),
    summary: textoOpcional,

    roleCategoryId: uuidOpcional,
    seniorityId: uuidOpcional,
    workModeId: uuidOpcional,
    contractTypeId: uuidOpcional,

    locationCity: textoOpcional,
    locationState: textoOpcional,
    locationCountry: z
      .string()
      .trim()
      .toUpperCase()
      .transform((valor) => (valor.length > 0 ? valor : null))
      .nullable()
      .refine((valor) => valor === null || /^[A-Z]{2}$/.test(valor), {
        message: 'Use a sigla de dois caracteres, como BR.',
      }),

    salaryMin: dinheiroOpcional,
    salaryMax: dinheiroOpcional,
    salaryCurrency: z.enum(MOEDAS).nullable().default(null),
    salaryPeriod: z.enum(PERIODOS_DE_SALARIO).default('month'),

    benefits: listaPorLinha,
    keywords: listaPorLinha,
    language: z.string().trim().min(2).default('pt-BR'),

    sourceUrl: z.url('Informe a URL do anúncio original.'),
    applyUrl: z.url('Informe a URL para onde a candidatura vai.'),

    technologyIds: z.array(z.uuid()).default([]),
    tagIds: z.array(z.uuid()).default([]),
  })
  .refine(
    (vaga) =>
      vaga.salaryMin === null ||
      vaga.salaryMax === null ||
      Number(vaga.salaryMin) <= Number(vaga.salaryMax),
    { message: 'O piso não pode ser maior que o teto.', path: ['salaryMin'] },
  )
  .refine((vaga) => vaga.salaryCurrency !== null || vaga.salaryMin === null, {
    message: 'Escolha a moeda da faixa salarial.',
    path: ['salaryCurrency'],
  })

export type EntradaDeVaga = z.input<typeof vagaSchema>
export type VagaValidada = z.output<typeof vagaSchema>

export const criarVagaSchema = vagaSchema
export const atualizarVagaSchema = z.object({ id: z.uuid() }).and(vagaSchema)

export const transicaoDeVagaSchema = z.object({
  id: z.uuid(),
  /** Data limite opcional ao publicar; sem ela o banco carimba 30 dias. */
  expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
})

export const excluirVagaSchema = z.object({ id: z.uuid() })
