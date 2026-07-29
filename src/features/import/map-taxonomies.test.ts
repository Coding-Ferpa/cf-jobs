import { describe, expect, it, vi } from 'vitest'

import {
  mapearTaxonomias,
  type Catalogo,
  type Correspondencia,
  type TipoDeTaxonomia,
} from './map-taxonomies'
import type { VagaClassificada } from './schema'

/**
 * O mapeamento é a trava que impede a IA de criar taxonomia (doc 05, etapa 4).
 * Tudo o que vira id de vaga aqui saiu do catálogo; o resto vira sugestão.
 *
 * O catálogo é uma porta justamente para estes testes: exato e alias são
 * decididos por SQL, e reimplementá-los aqui testaria o dublê. O que se testa
 * é a montagem — quem vira id, quem vira sugestão, quem vira aviso. O SQL de
 * verdade (inclusive o trigram) é coberto na integração.
 */

function vagaDe(campos: Partial<VagaClassificada> = {}): VagaClassificada {
  return {
    title: 'Pessoa Desenvolvedora Backend',
    company_name: 'Aurora Pagamentos',
    summary: 'Vaga de backend.',
    description_md: 'x'.repeat(120),
    work_mode: null,
    contract_type: null,
    seniority: null,
    role_category: null,
    technologies: [],
    tags: [],
    unmatched_terms: [],
    location: {},
    salary: {},
    benefits: [],
    keywords: [],
    language: 'pt-BR',
    posted_at: null,
    confidence: 0.9,
    ...campos,
  }
}

/** Catálogo de mentira: uma tabela de `tipo:termo` → correspondência. */
function catalogoDe(tabela: Record<string, Omit<Correspondencia, 'termo'>>): Catalogo {
  return {
    resolver: vi.fn(async (tipo: TipoDeTaxonomia, termos: string[]) =>
      termos
        .map((termo) => {
          const achado = tabela[`${tipo}:${termo.toLowerCase()}`]
          return achado ? { ...achado, termo } : null
        })
        .filter((item): item is Correspondencia => item !== null),
    ),
  }
}

const VAZIO: Catalogo = { resolver: async () => [] }

describe('mapearTaxonomias', () => {
  it('resolve os escalares por slug exato', async () => {
    const mapa = await mapearTaxonomias(
      vagaDe({
        work_mode: 'remoto',
        contract_type: 'clt',
        seniority: 'senior',
        role_category: 'backend',
      }),
      catalogoDe({
        'work_mode:remoto': { id: 'w1', slug: 'remoto', label: 'Remoto', via: 'exato' },
        'contract_type:clt': { id: 'c1', slug: 'clt', label: 'CLT', via: 'exato' },
        'seniority_level:senior': {
          id: 's1',
          slug: 'senior',
          label: 'Sênior',
          via: 'exato',
        },
        'role_category:backend': {
          id: 'r1',
          slug: 'backend',
          label: 'Backend',
          via: 'exato',
        },
      }),
    )

    expect(mapa).toMatchObject({
      workModeId: 'w1',
      contractTypeId: 'c1',
      seniorityId: 's1',
      roleCategoryId: 'r1',
    })
    expect(mapa.sugestoes).toEqual([])
    expect(mapa.avisos).toEqual([])
  })

  /**
   * O prompt canônico do doc 05 manda o modelo responder "hybrid" e "remote",
   * mas os slugs cadastrados são `hibrido` e `remoto` — os termos em inglês
   * estão lá como aliases. Sem esta resolução, toda vaga importada perderia a
   * modalidade.
   */
  it('resolve por alias o que o prompt pede em inglês', async () => {
    const mapa = await mapearTaxonomias(
      vagaDe({ work_mode: 'hybrid' }),
      catalogoDe({
        'work_mode:hybrid': { id: 'w2', slug: 'hibrido', label: 'Híbrido', via: 'alias' },
      }),
    )

    expect(mapa.workModeId).toBe('w2')
    expect(mapa.avisos).toEqual([])
  })

  it('avisa quando o match veio por semelhança', async () => {
    const mapa = await mapearTaxonomias(
      vagaDe({ technologies: ['ReactJS'] }),
      catalogoDe({
        'technology:reactjs': {
          id: 't1',
          slug: 'react',
          label: 'React',
          via: 'trigram',
          similaridade: 0.91,
        },
      }),
    )

    expect(mapa.technologyIds).toEqual(['t1'])
    expect(mapa.avisos).toEqual([
      '“ReactJS” foi reconhecido como React por semelhança (0,91).',
    ])
  })

  it('preserva a ordem das tecnologias — a primeira é a principal do card', async () => {
    const mapa = await mapearTaxonomias(
      vagaDe({ technologies: ['go', 'postgresql', 'docker'] }),
      catalogoDe({
        'technology:go': { id: 't-go', slug: 'go', label: 'Go', via: 'exato' },
        'technology:postgresql': {
          id: 't-pg',
          slug: 'postgresql',
          label: 'PostgreSQL',
          via: 'exato',
        },
        'technology:docker': {
          id: 't-dk',
          slug: 'docker',
          label: 'Docker',
          via: 'exato',
        },
      }),
    )

    expect(mapa.technologyIds).toEqual(['t-go', 't-pg', 't-dk'])
  })

  it('não repete o mesmo id quando dois termos caem na mesma taxonomia', async () => {
    const react = { id: 't1', slug: 'react', label: 'React', via: 'exato' as const }
    const mapa = await mapearTaxonomias(
      vagaDe({
        technologies: ['react'],
        unmatched_terms: [{ kind: 'technology', label: 'ReactJS', context: null }],
      }),
      catalogoDe({ 'technology:react': react, 'technology:reactjs': react }),
    )

    expect(mapa.technologyIds).toEqual(['t1'])
  })

  it('recupera para o campo o termo não mapeado que o catálogo conhece', async () => {
    const mapa = await mapearTaxonomias(
      vagaDe({
        unmatched_terms: [
          { kind: 'technology', label: 'Postgres', context: 'experiência com Postgres' },
        ],
      }),
      catalogoDe({
        'technology:postgres': {
          id: 't-pg',
          slug: 'postgresql',
          label: 'PostgreSQL',
          via: 'alias',
        },
      }),
    )

    expect(mapa.technologyIds).toEqual(['t-pg'])
    expect(mapa.sugestoes).toEqual([])
  })

  it('manda para a fila o que o catálogo não conhece, com o contexto', async () => {
    const mapa = await mapearTaxonomias(
      vagaDe({
        unmatched_terms: [
          { kind: 'technology', label: 'Datomic', context: 'experience with Datomic' },
        ],
      }),
      VAZIO,
    )

    expect(mapa.technologyIds).toEqual([])
    expect(mapa.sugestoes).toEqual([
      {
        kind: 'technology',
        suggestedLabel: 'Datomic',
        normalizedSlug: 'datomic',
        context: 'experience with Datomic',
      },
    ])
  })

  it('manda para a fila o escalar que não resolve, e o campo fica vazio', async () => {
    const mapa = await mapearTaxonomias(
      vagaDe({ role_category: 'growth-engineer' }),
      VAZIO,
    )

    expect(mapa.roleCategoryId).toBeNull()
    expect(mapa.sugestoes).toEqual([
      {
        kind: 'role_category',
        suggestedLabel: 'growth-engineer',
        normalizedSlug: 'growth-engineer',
        context: null,
      },
    ])
    expect(mapa.avisos).toEqual([
      'O modelo indicou “growth-engineer” em área, que não está no cadastro — o termo foi para a fila de sugestões.',
    ])
  })

  /**
   * O índice único parcial de `taxonomy_suggestions` é por (kind,
   * normalized_slug) entre as pendentes. Mandar o par repetido faria a inserção
   * inteira falhar.
   */
  it('não repete sugestão do mesmo termo escrito de dois jeitos', async () => {
    const mapa = await mapearTaxonomias(
      vagaDe({
        technologies: ['Datomic'],
        unmatched_terms: [
          { kind: 'technology', label: 'datomic', context: 'usa Datomic' },
        ],
      }),
      VAZIO,
    )

    expect(mapa.sugestoes).toHaveLength(1)
    expect(mapa.sugestoes[0]).toMatchObject({
      normalizedSlug: 'datomic',
      // O primeiro contexto encontrado é o que fica: um é melhor que nenhum.
      context: 'usa Datomic',
    })
  })

  it('descarta termo que não sobra nada depois de normalizado', async () => {
    const mapa = await mapearTaxonomias(
      vagaDe({ unmatched_terms: [{ kind: 'tag', label: '???', context: null }] }),
      VAZIO,
    )

    expect(mapa.sugestoes).toEqual([])
  })

  it('consulta o catálogo uma vez por tipo, com os termos em lote', async () => {
    const catalogo = catalogoDe({})
    await mapearTaxonomias(
      vagaDe({ technologies: ['go', 'rust'], tags: ['fintech'], work_mode: 'remoto' }),
      catalogo,
    )

    expect(catalogo.resolver).toHaveBeenCalledTimes(3)
    expect(catalogo.resolver).toHaveBeenCalledWith('technology', ['go', 'rust'])
    expect(catalogo.resolver).toHaveBeenCalledWith('tag', ['fintech'])
    expect(catalogo.resolver).toHaveBeenCalledWith('work_mode', ['remoto'])
  })

  it('não consulta nada quando a vaga não trouxe termo nenhum', async () => {
    const catalogo = catalogoDe({})
    const mapa = await mapearTaxonomias(vagaDe(), catalogo)

    expect(catalogo.resolver).not.toHaveBeenCalled()
    expect(mapa.technologyIds).toEqual([])
    expect(mapa.tagIds).toEqual([])
  })
})
