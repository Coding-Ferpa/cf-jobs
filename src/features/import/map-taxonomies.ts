import { kebab } from '@/lib/slug'

import type { VagaClassificada } from './schema'

/**
 * Mapeamento de taxonomias (doc 05, etapa 4).
 *
 * Aqui está a trava que sustenta o projeto: **a IA nunca cria taxonomia**.
 * Todo id que sai daqui veio do catálogo; termo que não resolve vira sugestão
 * pendente e passa por gente antes de virar cadastro.
 *
 * A busca é uma cascata de três: slug exato → alias → semelhança por trigram.
 * O terceiro degrau existe porque o prompt canônico do doc 05 pede ao modelo
 * respostas como "hybrid" e "ReactJS", enquanto o cadastro tem `hibrido` e
 * `react` — os dois primeiros degraus cobrem o previsto (os aliases do seed),
 * o trigram cobre o resto.
 *
 * O catálogo é uma **porta** e não um import do `db/`: as três estratégias
 * cabem em uma consulta só do lado de quem sabe SQL, e assim este módulo
 * continua rodando sem Next e sem Postgres (doc 02).
 */

/** Os `kind` que `taxonomy_suggestions` aceita (check da migration 0005). */
export const TIPOS_DE_TAXONOMIA = [
  'technology',
  'tag',
  'role_category',
  'seniority_level',
  'work_mode',
  'contract_type',
] as const

export type TipoDeTaxonomia = (typeof TIPOS_DE_TAXONOMIA)[number]

export type ViaDoMatch = 'exato' | 'alias' | 'trigram'

export type Correspondencia = {
  /** O termo procurado, exatamente como o modelo escreveu. */
  termo: string
  id: string
  slug: string
  label: string
  via: ViaDoMatch
  /** Só quando `via` é `trigram`. */
  similaridade?: number
}

export type Catalogo = {
  /** Uma ida ao banco por tipo, com os termos em lote. */
  resolver(tipo: TipoDeTaxonomia, termos: string[]): Promise<Correspondencia[]>
}

export type SugestaoDeTermo = {
  kind: TipoDeTaxonomia
  suggestedLabel: string
  normalizedSlug: string
  context: string | null
}

export type MapeamentoDaVaga = {
  roleCategoryId: string | null
  seniorityId: string | null
  workModeId: string | null
  contractTypeId: string | null
  /** Na ordem em que o modelo citou: a primeira é a principal do card (doc 04). */
  technologyIds: string[]
  tagIds: string[]
  sugestoes: SugestaoDeTermo[]
  /** O que a revisão humana precisa saber que aconteceu em silêncio. */
  avisos: string[]
}

/** Nome do campo nos avisos — quem revisa lê a tela, não o schema. */
const NOME_DO_CAMPO: Record<TipoDeTaxonomia, string> = {
  technology: 'tecnologias',
  tag: 'tags',
  role_category: 'área',
  seniority_level: 'senioridade',
  work_mode: 'modalidade',
  contract_type: 'contratação',
}

type Pedido = { tipo: TipoDeTaxonomia; termo: string; context: string | null }

function pedidosDaVaga(vaga: VagaClassificada): Pedido[] {
  const pedidos: Pedido[] = []
  const adicionar = (tipo: TipoDeTaxonomia, termo: string | null | undefined) => {
    if (termo && termo.trim().length > 0) pedidos.push({ tipo, termo, context: null })
  }

  adicionar('role_category', vaga.role_category)
  adicionar('seniority_level', vaga.seniority)
  adicionar('work_mode', vaga.work_mode)
  adicionar('contract_type', vaga.contract_type)

  for (const slug of vaga.technologies) adicionar('technology', slug)
  for (const slug of vaga.tags) adicionar('tag', slug)

  // Os termos que o modelo separou por não achar nas listas entram na mesma
  // cascata: é comum o catálogo conhecê-los por alias.
  for (const termo of vaga.unmatched_terms) {
    if (termo.label.trim().length === 0) continue
    pedidos.push({
      tipo: termo.kind,
      termo: termo.label,
      context: termo.context ?? null,
    })
  }

  return pedidos
}

function agruparPorTipo(pedidos: Pedido[]): Map<TipoDeTaxonomia, string[]> {
  const grupos = new Map<TipoDeTaxonomia, string[]>()

  for (const pedido of pedidos) {
    const termos = grupos.get(pedido.tipo) ?? []
    // O mesmo termo duas vezes (em `technologies` e em `unmatched_terms`, por
    // exemplo) é uma consulta só.
    if (!termos.some((termo) => termo.toLowerCase() === pedido.termo.toLowerCase())) {
      termos.push(pedido.termo)
    }
    grupos.set(pedido.tipo, termos)
  }

  return grupos
}

function chave(tipo: TipoDeTaxonomia, termo: string): string {
  return `${tipo}:${termo.toLowerCase()}`
}

function avisoDeSemelhanca(correspondencia: Correspondencia): string {
  const similaridade = (correspondencia.similaridade ?? 0).toFixed(2).replace('.', ',')
  return `“${correspondencia.termo}” foi reconhecido como ${correspondencia.label} por semelhança (${similaridade}).`
}

export async function mapearTaxonomias(
  vaga: VagaClassificada,
  catalogo: Catalogo,
): Promise<MapeamentoDaVaga> {
  const pedidos = pedidosDaVaga(vaga)
  const grupos = [...agruparPorTipo(pedidos)]

  const respostas = await Promise.all(
    grupos.map(async ([tipo, termos]) => ({
      tipo,
      encontradas: await catalogo.resolver(tipo, termos),
    })),
  )

  // Indexado por tipo **e** termo: "mobile" é tecnologia e área ao mesmo tempo,
  // e uma chave só pelo termo faria uma resposta atropelar a outra.
  const porTermo = new Map<string, Correspondencia>()
  for (const { tipo, encontradas } of respostas) {
    for (const item of encontradas) porTermo.set(chave(tipo, item.termo), item)
  }

  return montar(pedidos, porTermo)
}

function montar(
  pedidos: Pedido[],
  porTermo: Map<string, Correspondencia>,
): MapeamentoDaVaga {
  const avisos: string[] = []
  const sugestoes = new Map<string, SugestaoDeTermo>()
  const tecnologias: string[] = []
  const tags: string[] = []
  const escalares: Partial<Record<TipoDeTaxonomia, string>> = {}
  const jaAvisado = new Set<string>()

  for (const pedido of pedidos) {
    const achado = porTermo.get(chave(pedido.tipo, pedido.termo))

    if (achado) {
      if (achado.via === 'trigram' && !jaAvisado.has(achado.id)) {
        jaAvisado.add(achado.id)
        avisos.push(avisoDeSemelhanca(achado))
      }

      if (pedido.tipo === 'technology') {
        if (!tecnologias.includes(achado.id)) tecnologias.push(achado.id)
      } else if (pedido.tipo === 'tag') {
        if (!tags.includes(achado.id)) tags.push(achado.id)
      } else {
        escalares[pedido.tipo] ??= achado.id
      }
      continue
    }

    const normalizedSlug = kebab(pedido.termo)
    // Termo que vira slug vazio ("???") não tem como ser deduplicado pelo
    // índice único nem revisado por alguém — não vale uma linha na fila.
    if (normalizedSlug.length === 0) continue

    const identidade = chave(pedido.tipo, normalizedSlug)
    if (!sugestoes.has(identidade)) {
      sugestoes.set(identidade, {
        kind: pedido.tipo,
        suggestedLabel: pedido.termo,
        normalizedSlug,
        context: pedido.context,
      })

      // Escalar sem correspondência some do formulário: quem revisa precisa
      // saber que o modelo tinha uma resposta, e qual era.
      if (pedido.tipo !== 'technology' && pedido.tipo !== 'tag') {
        avisos.push(
          `O modelo indicou “${pedido.termo}” em ${NOME_DO_CAMPO[pedido.tipo]}, ` +
            'que não está no cadastro — o termo foi para a fila de sugestões.',
        )
      }
    } else {
      // Contexto de qualquer uma das ocorrências serve; o primeiro que houver.
      const anterior = sugestoes.get(identidade)!
      if (anterior.context === null && pedido.context) {
        sugestoes.set(identidade, { ...anterior, context: pedido.context })
      }
    }
  }

  return {
    roleCategoryId: escalares.role_category ?? null,
    seniorityId: escalares.seniority_level ?? null,
    workModeId: escalares.work_mode ?? null,
    contractTypeId: escalares.contract_type ?? null,
    technologyIds: tecnologias,
    tagIds: tags,
    sugestoes: [...sugestoes.values()],
    avisos,
  }
}
