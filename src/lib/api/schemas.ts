import { z } from '@/lib/zod'

/**
 * Corpo das respostas da API v1 (doc 06), em Zod.
 *
 * Os tipos de `serialize.ts` são inferidos daqui e o OpenAPI é gerado daqui —
 * então o contrato publicado, o corpo que sai e o tipo que o TypeScript
 * confere nascem todos do mesmo lugar. Divergir exige mudar este arquivo, o
 * que é exatamente o ponto.
 */

const slug = z.string().meta({ example: 'pessoa-desenvolvedora-backend-nubank-a1b2c3' })

export const tecnologiaSchema = z
  .object({
    slug: z.string().meta({ example: 'clojure' }),
    label: z.string().meta({ example: 'Clojure' }),
    is_primary: z.boolean().meta({
      description: 'Tecnologia central da vaga, e não apenas citada de passagem.',
    }),
  })
  .meta({ id: 'Tecnologia' })

export const empresaSchema = z
  .object({
    name: z.string().meta({ example: 'Nubank' }),
    slug: z.string().meta({ example: 'nubank' }),
    logo_url: z.url().nullable(),
  })
  .meta({ id: 'Empresa' })

export const localizacaoSchema = z
  .object({
    city: z.string().nullable().meta({ example: 'São Paulo' }),
    state: z.string().nullable().meta({ example: 'SP' }),
    country: z
      .string()
      .nullable()
      .meta({ example: 'BR', description: 'Código ISO 3166-1 alfa-2.' }),
  })
  .meta({ id: 'Localizacao' })

export const salarioSchema = z
  .object({
    min: z.number().nullable().meta({ example: 12000 }),
    max: z.number().nullable().meta({ example: 18000 }),
    currency: z.string().nullable().meta({ example: 'BRL' }),
    period: z.enum(['hour', 'month', 'year']),
  })
  .meta({
    id: 'Salario',
    description:
      'Nulo quando a vaga não divulga faixa — o que é a maioria dos casos no Brasil.',
  })

export const vagaSchema = z
  .object({
    slug,
    title: z.string().meta({ example: 'Pessoa Desenvolvedora Backend' }),
    company: empresaSchema,
    summary: z.string().nullable(),
    role_category: z.string().nullable().meta({ example: 'backend' }),
    seniority: z.string().nullable().meta({ example: 'senior' }),
    work_mode: z.string().nullable().meta({ example: 'remoto' }),
    contract_type: z.string().nullable().meta({ example: 'clt' }),
    location: localizacaoSchema,
    salary: salarioSchema,
    technologies: z.array(tecnologiaSchema),
    tags: z.array(z.string()).meta({ example: ['fintech'] }),
    status: z.enum(['published', 'archived']),
    published_at: z.iso.datetime().nullable(),
    expires_at: z.iso.datetime().nullable(),
    url: z.url().meta({ description: 'Página da vaga no CF Jobs.' }),
  })
  .meta({
    id: 'Vaga',
    description:
      'Taxonomias saem como slug: é o mesmo valor aceito nos filtros. O rótulo ' +
      'humano vem de /taxonomies, uma vez, em vez de repetido em cada vaga.',
  })

export const vagaDetalheSchema = vagaSchema
  .extend({
    description_md: z.string().meta({
      description: 'Markdown já sanitizado. Nunca contém HTML executável.',
    }),
    benefits: z.array(z.string()),
    keywords: z.array(z.string()),
    language: z.string().meta({ example: 'pt-BR' }),
    apply_url: z.url(),
    source_url: z.url().meta({ description: 'Onde a vaga foi publicada originalmente.' }),
    source_site: z.string().nullable(),
    views_count: z.int().nonnegative(),
    clicks_count: z.int().nonnegative(),
    updated_at: z.iso.datetime(),
    archived_at: z.iso.datetime().nullable(),
  })
  .meta({ id: 'VagaDetalhe' })

export const listaDeVagasSchema = z
  .object({
    data: z.array(vagaSchema),
    page: z.object({
      next_cursor: z.string().nullable().meta({
        description: 'Opaco. Repasse como está em `?cursor=`; nulo na última página.',
      }),
      has_more: z.boolean(),
    }),
    meta: z.object({
      total_estimate: z.int().meta({
        description:
          'Satura em 1000. Contar a tabela inteira a cada listagem custaria caro ' +
          'e ninguém pagina até o fim — daí ser estimativa.',
      }),
    }),
  })
  .meta({ id: 'ListaDeVagas' })

export const itemDeTaxonomiaSchema = z
  .object({
    slug: z.string().meta({ example: 'go' }),
    label: z.string().meta({ example: 'Go' }),
    kind: z
      .string()
      .optional()
      .meta({ description: 'Só em technologies: linguagem, framework, banco, cloud…' }),
  })
  .meta({ id: 'ItemDeTaxonomia' })

export const taxonomiasSchema = z
  .object({
    technologies: z.array(itemDeTaxonomiaSchema),
    role_categories: z.array(itemDeTaxonomiaSchema),
    seniority_levels: z.array(itemDeTaxonomiaSchema),
    work_modes: z.array(itemDeTaxonomiaSchema),
    contract_types: z.array(itemDeTaxonomiaSchema),
    tags: z.array(itemDeTaxonomiaSchema),
  })
  .meta({ id: 'Taxonomias' })

export const eventoSchema = z
  .object({
    job_slug: z.string().min(1).max(200).meta({ example: 'sre-aurora-f6a7b8' }),
    event_type: z.enum(['view', 'click_apply', 'share']),
    referrer: z.string().max(500).optional(),
    utm_source: z.string().max(100).optional(),
  })
  .meta({
    id: 'Evento',
    description:
      'O visitante nunca envia identificador: o servidor deriva o hash anônimo ' +
      'a partir de IP, user agent, dia e um sal secreto (doc 07).',
  })

export const problemSchema = z
  .object({
    type: z.string().meta({ example: 'about:blank' }),
    title: z.string().meta({ example: 'Não encontrado' }),
    status: z.int(),
    detail: z.string(),
    instance: z.string(),
  })
  .meta({
    id: 'Problem',
    description: 'Erro no formato RFC 9457 (application/problem+json).',
  })

export type VagaPublica = z.infer<typeof vagaSchema>
export type VagaPublicaDetalhe = z.infer<typeof vagaDetalheSchema>
export type TecnologiaPublica = z.infer<typeof tecnologiaSchema>
export type ListaDeVagas = z.infer<typeof listaDeVagasSchema>
export type Taxonomias = z.infer<typeof taxonomiasSchema>
