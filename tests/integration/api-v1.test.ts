import { randomUUID } from 'node:crypto'

import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { GET as listar, OPTIONS as preflight } from '@/app/api/v1/jobs/route'
import { GET as detalhar } from '@/app/api/v1/jobs/[slug]/route'
import { GET as taxonomias } from '@/app/api/v1/taxonomies/route'
import { LIMITE_DE_LEITURA } from '@/lib/api/rate-limit'
import type { ProblemDetails } from '@/lib/api/problem'
import type { ListaDeVagas, Taxonomias, VagaPublicaDetalhe } from '@/lib/api/schemas'

/**
 * A API v1 contra o banco de verdade (doc 12): filtros, cursor e rate limit.
 *
 * Os handlers são chamados direto, sem servidor HTTP no meio — é o mesmo
 * código que a Vercel executa, e sem o servidor o teste não depende de porta
 * livre nem de build.
 *
 * Cada teste usa um IP próprio: o balde do rate limit é por endereço, então um
 * teste que estoura o limite não pode derrubar o seguinte.
 */

const BASE = 'http://localhost:3000/api/v1'

function requisicao(caminho: string, ip = randomUUID()) {
  return new NextRequest(`${BASE}${caminho}`, {
    headers: { 'x-forwarded-for': ip },
  })
}

async function lista(query = ''): Promise<ListaDeVagas> {
  const resposta = await listar(requisicao(`/jobs${query}`))
  expect(resposta.status).toBe(200)
  return (await resposta.json()) as ListaDeVagas
}

describe('GET /api/v1/jobs — filtros', () => {
  it('devolve só publicadas por padrão', async () => {
    const { data } = await lista()

    expect(data.length).toBeGreaterThan(0)
    expect(data.every((vaga) => vaga.status === 'published')).toBe(true)
  })

  it('combina valores do mesmo parâmetro com OR', async () => {
    const { data } = await lista('?seniority=senior,pleno')

    expect(data.length).toBeGreaterThan(0)
    expect(data.every((vaga) => ['senior', 'pleno'].includes(vaga.seniority ?? ''))).toBe(
      true,
    )
  })

  it('combina tecnologias com AND — quem pede duas quer as duas', async () => {
    const [uma, outra] = ['kubernetes', 'terraform']
    const { data } = await lista(`?tech=${uma},${outra}`)

    expect(data.length).toBeGreaterThan(0)
    for (const vaga of data) {
      const slugs = vaga.technologies.map((tecnologia) => tecnologia.slug)
      expect(slugs).toContain(uma)
      expect(slugs).toContain(outra)
    }
  })

  it('combina parâmetros diferentes com AND', async () => {
    const { data } = await lista('?work_mode=remoto&contract_type=clt')

    for (const vaga of data) {
      expect(vaga.work_mode).toBe('remoto')
      expect(vaga.contract_type).toBe('clt')
    }
  })

  it('encontra por busca textual', async () => {
    const { data } = await lista('?q=react')

    expect(data.length).toBeGreaterThan(0)
  })

  it('não devolve nada para filtro sem correspondência, em vez de ignorá-lo', async () => {
    const { data, meta } = await lista('?tech=nao-existe-esta-tecnologia')

    expect(data).toEqual([])
    expect(meta.total_estimate).toBe(0)
  })

  it('mostra arquivadas só quando pedido', async () => {
    const padrao = await lista()
    const arquivadas = await lista('?status=archived')

    expect(padrao.data.some((vaga) => vaga.status === 'archived')).toBe(false)
    expect(arquivadas.data.length).toBeGreaterThan(0)
    expect(arquivadas.data.every((vaga) => vaga.status === 'archived')).toBe(true)
  })

  it('nunca deixa rascunho vazar — a leitura roda como anon', async () => {
    const todas = await lista('?status=all&limit=50')

    expect(
      todas.data.every((vaga) => ['published', 'archived'].includes(vaga.status)),
    ).toBe(true)
  })
})

describe('GET /api/v1/jobs — cursor', () => {
  it('pagina sem repetir nem pular vaga', async () => {
    const primeira = await lista('?limit=3')
    expect(primeira.page.has_more).toBe(true)
    expect(primeira.page.next_cursor).not.toBeNull()

    const segunda = await lista(`?limit=3&cursor=${primeira.page.next_cursor}`)

    const slugs = [...primeira.data, ...segunda.data].map((vaga) => vaga.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('mantém a ordem decrescente de publicação entre páginas', async () => {
    const primeira = await lista('?limit=3')
    const segunda = await lista(`?limit=3&cursor=${primeira.page.next_cursor}`)

    const datas = [...primeira.data, ...segunda.data].map((vaga) =>
      new Date(vaga.published_at ?? 0).getTime(),
    )

    expect([...datas].sort((a, b) => b - a)).toEqual(datas)
  })

  it('recomeça do topo quando o cursor é lixo, em vez de estourar', async () => {
    const { data } = await lista('?limit=3&cursor=nao-e-um-cursor')
    const doTopo = await lista('?limit=3')

    expect(data.map((vaga) => vaga.slug)).toEqual(doTopo.data.map((vaga) => vaga.slug))
  })

  it('fecha a paginação na última página', async () => {
    const { page } = await lista('?limit=50')

    expect(page.has_more).toBe(false)
    expect(page.next_cursor).toBeNull()
  })
})

describe('GET /api/v1/jobs/{slug}', () => {
  it('detalha uma vaga publicada', async () => {
    const { data } = await lista('?limit=1')
    const slug = data[0]!.slug

    const resposta = await detalhar(requisicao(`/jobs/${slug}`), {
      params: Promise.resolve({ slug }),
    })
    expect(resposta.status).toBe(200)

    const vaga = (await resposta.json()) as VagaPublicaDetalhe
    expect(vaga.slug).toBe(slug)
    expect(vaga.description_md.length).toBeGreaterThan(0)
    expect(vaga.apply_url).toMatch(/^https?:\/\//)
  })

  it('entrega vaga arquivada com status archived, e não 404', async () => {
    const { data } = await lista('?status=archived&limit=1')
    const slug = data[0]!.slug

    const resposta = await detalhar(requisicao(`/jobs/${slug}`), {
      params: Promise.resolve({ slug }),
    })

    expect(resposta.status).toBe(200)
    expect(((await resposta.json()) as VagaPublicaDetalhe).status).toBe('archived')
  })

  it('responde 404 em Problem Details para slug inexistente', async () => {
    const resposta = await detalhar(requisicao('/jobs/nao-existe'), {
      params: Promise.resolve({ slug: 'nao-existe' }),
    })

    expect(resposta.status).toBe(404)
    expect(resposta.headers.get('content-type')).toBe('application/problem+json')

    const problema = (await resposta.json()) as ProblemDetails
    expect(problema.status).toBe(404)
    expect(problema.instance).toBe('/api/v1/jobs/nao-existe')
  })
})

describe('GET /api/v1/taxonomies', () => {
  it('agrupa as taxonomias ativas por tipo', async () => {
    const resposta = await taxonomias(requisicao('/taxonomies'))
    expect(resposta.status).toBe(200)

    const grupos = (await resposta.json()) as Taxonomias
    expect(Object.keys(grupos).sort()).toEqual([
      'contract_types',
      'role_categories',
      'seniority_levels',
      'tags',
      'technologies',
      'work_modes',
    ])
    expect(grupos.technologies.length).toBeGreaterThan(0)
    expect(grupos.technologies[0]).toHaveProperty('kind')
  })

  it('cacheia por uma hora', async () => {
    const resposta = await taxonomias(requisicao('/taxonomies'))

    expect(resposta.headers.get('cache-control')).toContain('s-maxage=3600')
  })
})

describe('rate limit', () => {
  it('libera até o teto e barra a partir dele, com Retry-After', async () => {
    const ip = randomUUID()

    let ultima = await listar(requisicao('/jobs?limit=1', ip))
    for (let i = 1; i < LIMITE_DE_LEITURA; i += 1) {
      ultima = await listar(requisicao('/jobs?limit=1', ip))
    }

    // A última requisição dentro do teto ainda passa.
    expect(ultima.status).toBe(200)
    expect(ultima.headers.get('x-ratelimit-remaining')).toBe('0')

    const barrada = await listar(requisicao('/jobs?limit=1', ip))
    expect(barrada.status).toBe(429)
    expect(Number(barrada.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(barrada.headers.get('content-type')).toBe('application/problem+json')
  })

  it('conta por IP: o balde de um não gasta o do outro', async () => {
    const primeiro = await listar(requisicao('/jobs?limit=1', randomUUID()))
    const segundo = await listar(requisicao('/jobs?limit=1', randomUUID()))

    expect(primeiro.headers.get('x-ratelimit-remaining')).toBe(
      segundo.headers.get('x-ratelimit-remaining'),
    )
  })
})

describe('contrato HTTP', () => {
  it('libera CORS de leitura para qualquer origem', async () => {
    const resposta = await listar(requisicao('/jobs?limit=1'))

    expect(resposta.headers.get('access-control-allow-origin')).toBe('*')
    expect(resposta.headers.get('cache-control')).toContain('s-maxage=60')
  })

  it('responde o preflight', async () => {
    expect(preflight().status).toBe(204)
  })

  it('recusa parâmetro inválido em Problem Details, em pt-BR', async () => {
    const resposta = await listar(requisicao('/jobs?limit=999'))
    expect(resposta.status).toBe(400)

    const problema = (await resposta.json()) as ProblemDetails
    expect(problema.title).toBe('Requisição inválida')
    expect(problema.detail).toContain('limit')
    // Uma mensagem em inglês aqui significaria que o Zod respondeu no lugar da
    // nossa mensagem — que é o que o doc 03 não quer na cara do usuário.
    expect(problema.detail).not.toMatch(/expected|invalid|too big/i)
  })
})
