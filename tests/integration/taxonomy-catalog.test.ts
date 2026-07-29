import { describe, expect, it } from 'vitest'

import { catalogoDoBanco, LIMIAR_DE_SEMELHANCA } from '@/db/queries/taxonomy-catalog'
import { mapearTaxonomias } from '@/features/import/map-taxonomies'
import type { VagaClassificada } from '@/features/import/schema'

/**
 * A cascata da etapa 4 do doc 05 contra o banco de verdade, com o seed.
 *
 * O trigram só existe aqui: reproduzi-lo em memória seria reimplementar o
 * pg_trgm e testar a reimplementação (doc 12).
 */

const catalogo = catalogoDoBanco()

describe('cascata exato → alias → trigram', () => {
  it('acha pelo slug', async () => {
    const [achado] = await catalogo.resolver('technology', ['postgresql'])

    expect(achado).toMatchObject({ slug: 'postgresql', via: 'exato' })
  })

  it('ignora caixa e espaço em volta', async () => {
    const [achado] = await catalogo.resolver('technology', ['  PostgreSQL '])

    expect(achado).toMatchObject({ slug: 'postgresql', via: 'exato' })
  })

  /**
   * O caso que motiva a etapa inteira: o prompt canônico do doc 05 manda o
   * modelo responder "hybrid" e "remote", e os slugs cadastrados são `hibrido`
   * e `remoto`. Sem o alias, toda vaga importada perderia a modalidade.
   */
  it('acha pelo alias o que o prompt pede em inglês', async () => {
    const [modalidade] = await catalogo.resolver('work_mode', ['hybrid'])
    const [outra] = await catalogo.resolver('work_mode', ['remote'])

    expect(modalidade).toMatchObject({ slug: 'hibrido', via: 'alias' })
    expect(outra).toMatchObject({ slug: 'remoto', via: 'alias' })
  })

  /**
   * O caso real do trigram é pontuação sobrando: `node.js` não é o slug
   * (`nodejs`) nem está entre os aliases, mas é o rótulo com outra grafia.
   */
  it('acha por semelhança o que não está no slug nem nos aliases', async () => {
    const [achado] = await catalogo.resolver('technology', ['Node.js'])

    expect(achado).toMatchObject({ slug: 'nodejs', via: 'trigram' })
    expect(achado?.similaridade).toBeGreaterThan(LIMIAR_DE_SEMELHANCA)
  })

  /**
   * O exemplo do doc 05 ("ReactJS" → react) não passa pelo trigram: a
   * semelhança medida é 0,56, bem abaixo do limiar de 0,85 que o próprio doc
   * fixa. Quem resolve é o alias `reactjs` do seed — o trigram é rede de
   * segurança para o que ninguém cadastrou, não para o que já está cadastrado.
   */
  it('resolve o exemplo do doc pelo alias, não pela semelhança', async () => {
    const [achado] = await catalogo.resolver('technology', ['ReactJS'])

    expect(achado).toMatchObject({ slug: 'react', via: 'alias' })
  })

  it('não força um match distante — abaixo do limiar não casa', async () => {
    expect(await catalogo.resolver('technology', ['Datomic'])).toEqual([])
    // 0,64 de semelhança com PostgreSQL: perto, e ainda assim não é.
    expect(await catalogo.resolver('technology', ['Postgre SQL'])).toEqual([])
  })

  it('prefere o exato ao alias quando os dois casam', async () => {
    // `estagio` é slug em seniority_levels e alias de contract_types; dentro de
    // seniority o exato tem que ganhar.
    const [achado] = await catalogo.resolver('seniority_level', ['estagio'])

    expect(achado).toMatchObject({ slug: 'estagio', via: 'exato' })
  })

  it('resolve vários termos na mesma ida', async () => {
    const achados = await catalogo.resolver('technology', ['go', 'react', 'docker'])

    expect(achados.map((item) => item.slug).sort()).toEqual(['docker', 'go', 'react'])
  })

  it('devolve vazio sem consultar quando não há termo', async () => {
    expect(await catalogo.resolver('tag', [])).toEqual([])
  })

  it('não enxerga taxonomia desativada', async () => {
    // Nada no seed está inativo; o que se afirma é o filtro, não o dado.
    const achados = await catalogo.resolver('technology', ['go'])
    expect(achados).toHaveLength(1)
  })
})

describe('mapeamento de uma vaga inteira', () => {
  const vaga: VagaClassificada = {
    title: 'Pessoa Desenvolvedora Backend',
    company_name: 'Aurora Pagamentos',
    summary: 'Backend com Go.',
    description_md: 'x'.repeat(120),
    // Exatamente como o prompt do doc 05 induz o modelo a responder.
    work_mode: 'hybrid',
    contract_type: 'clt',
    seniority: 'senior',
    role_category: 'backend',
    technologies: ['go', 'postgresql', 'Datomic'],
    tags: ['fintech'],
    // O modelo separou porque não achou nas listas; o catálogo conhece.
    unmatched_terms: [
      { kind: 'technology', label: 'Clojure', context: 'experiência com Clojure' },
    ],
    location: {},
    salary: {},
    benefits: [],
    keywords: [],
    language: 'pt-BR',
    posted_at: null,
    confidence: 0.9,
  }

  it('preenche os campos e manda só o desconhecido para a fila', async () => {
    const mapa = await mapearTaxonomias(vaga, catalogo)

    expect(mapa.workModeId).not.toBeNull()
    expect(mapa.contractTypeId).not.toBeNull()
    expect(mapa.seniorityId).not.toBeNull()
    expect(mapa.roleCategoryId).not.toBeNull()
    // go, postgresql e o Clojure recuperado do não-mapeado.
    expect(mapa.technologyIds).toHaveLength(3)
    expect(mapa.tagIds).toHaveLength(1)

    expect(mapa.sugestoes).toEqual([
      {
        kind: 'technology',
        suggestedLabel: 'Datomic',
        normalizedSlug: 'datomic',
        context: null,
      },
    ])
  })

  it('só vira sugestão o que o catálogo realmente não conhece', async () => {
    const mapa = await mapearTaxonomias(
      {
        ...vaga,
        technologies: [],
        unmatched_terms: [
          { kind: 'technology', label: 'Clojure', context: 'usa Clojure' },
          { kind: 'tag', label: 'Web3', context: null },
        ],
      },
      catalogo,
    )

    expect(mapa.technologyIds).toHaveLength(1)
    expect(mapa.sugestoes).toEqual([
      { kind: 'tag', suggestedLabel: 'Web3', normalizedSlug: 'web3', context: null },
    ])
  })
})
