import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { abrirSessao, type CookiesFalsos, type Papel } from './sessao'

/**
 * Matriz de autorização das Server Actions (docs 06, 07 e 12) com sessão de
 * verdade em cada papel.
 *
 * O gate real da escrita é o `defineAction`: a conexão do app não carrega JWT,
 * então a RLS baseada em `auth.jwt()` não se aplica a ela (ver o comentário no
 * próprio `defineAction`). Por isso esta suíte existe — é ela que prova que o
 * gate de aplicação está no lugar, papel por papel.
 */

const estado = vi.hoisted(() => ({ cookies: null as unknown }))

// O cliente do Supabase lê a sessão de `cookies()`; injetamos os cookies que
// saíram de um login de senha real no GoTrue local.
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve(estado.cookies),
}))

// Fora de uma requisição do Next não há cache para invalidar.
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

const { db } = await import('@/db/client')
const { auditLogs, companies, jobs, profiles } = await import('@/db/schema')
const { criarVaga, excluirVaga, publicarVaga } = await import('@/actions/jobs')
const { definirPapel, salvarEmpresa } = await import('@/actions/admin')

const sessoes = new Map<Papel, CookiesFalsos>()

async function entrarComo(papel: Papel | null) {
  if (papel === null) {
    estado.cookies = { getAll: () => [], get: () => undefined, set: () => {} }
    return
  }

  const existente = sessoes.get(papel) ?? (await abrirSessao(papel))
  sessoes.set(papel, existente)
  estado.cookies = existente
}

const criadas: string[] = []
let empresaId = ''

function payloadDeVaga(sufixo: string) {
  return {
    title: `Vaga de integração ${sufixo}`,
    companyId: empresaId,
    descriptionMd:
      '## Sobre a vaga\n\nDescrição longa o bastante para passar do mínimo de cinquenta caracteres exigido pelo schema.',
    sourceUrl: `https://exemplo.test/integracao/${sufixo}`,
    applyUrl: `https://exemplo.test/integracao/${sufixo}/candidatar`,
  }
}

beforeAll(async () => {
  await entrarComo('editor')

  const [empresa] = await db.select({ id: companies.id }).from(companies).limit(1)

  if (!empresa) throw new Error('Seed sem empresas — rode `pnpm db:reset`.')
  empresaId = empresa.id
})

afterAll(async () => {
  // Limpa só o que esta suíte criou: o seed continua servindo os outros testes.
  for (const id of criadas) {
    await db.delete(jobs).where(eq(jobs.id, id))
  }
  await db.delete(auditLogs).where(sql`${auditLogs.action} like 'job.%'`)
})

describe('criarVaga — papel mínimo editor', () => {
  it('deixa o editor criar, e a vaga nasce como rascunho', async () => {
    await entrarComo('editor')
    const resultado = await criarVaga(payloadDeVaga(randomUUID().slice(0, 8)))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return

    criadas.push(resultado.data.id)

    const [vaga] = await db
      .select({ status: jobs.status, slug: jobs.slug })
      .from(jobs)
      .where(eq(jobs.id, resultado.data.id))

    expect(vaga?.status).toBe('draft')
    expect(vaga?.slug).toContain('vaga-de-integracao')
  })

  it('registra a auditoria na mesma transação', async () => {
    await entrarComo('editor')
    const resultado = await criarVaga(payloadDeVaga(randomUUID().slice(0, 8)))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    criadas.push(resultado.data.id)

    const [log] = await db
      .select({ action: auditLogs.action, actorId: auditLogs.actorId })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, resultado.data.id))

    expect(log?.action).toBe('job.create')
    expect(log?.actorId).not.toBeNull()
  })

  it('nega a moderação, que revisa fila mas não cria vaga', async () => {
    await entrarComo('moderator')
    const resultado = await criarVaga(payloadDeVaga(randomUUID().slice(0, 8)))

    expect(resultado).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('nega quem só lê', async () => {
    await entrarComo('reader')
    const resultado = await criarVaga(payloadDeVaga(randomUUID().slice(0, 8)))

    expect(resultado).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('nega quem não entrou', async () => {
    await entrarComo(null)
    const resultado = await criarVaga(payloadDeVaga(randomUUID().slice(0, 8)))

    expect(resultado).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
  })

  it('recusa entrada inválida antes de tocar o banco', async () => {
    await entrarComo('editor')
    const resultado = await criarVaga({ ...payloadDeVaga('curto'), title: 'ab' })

    expect(resultado).toMatchObject({ ok: false, error: { code: 'validation_error' } })
    if (resultado.ok) return
    expect(resultado.error.fieldErrors?.title).toBeDefined()
  })

  it('recusa a mesma URL de origem duas vezes', async () => {
    await entrarComo('editor')
    const payload = payloadDeVaga(randomUUID().slice(0, 8))

    const primeira = await criarVaga(payload)
    expect(primeira.ok).toBe(true)
    if (primeira.ok) criadas.push(primeira.data.id)

    const segunda = await criarVaga({ ...payload, title: 'Outro título qualquer' })
    expect(segunda).toMatchObject({ ok: false, error: { code: 'duplicate_job' } })
  })
})

describe('publicarVaga — papel mínimo editor', () => {
  it('publica com o editor e carimba published_at', async () => {
    await entrarComo('editor')
    const criada = await criarVaga(payloadDeVaga(randomUUID().slice(0, 8)))
    expect(criada.ok).toBe(true)
    if (!criada.ok) return
    criadas.push(criada.data.id)

    const publicada = await publicarVaga({ id: criada.data.id })
    expect(publicada.ok).toBe(true)

    const [vaga] = await db
      .select({ status: jobs.status, publishedAt: jobs.publishedAt })
      .from(jobs)
      .where(eq(jobs.id, criada.data.id))

    expect(vaga?.status).toBe('published')
    expect(vaga?.publishedAt).not.toBeNull()
  })

  it('nega a moderação', async () => {
    await entrarComo('editor')
    const criada = await criarVaga(payloadDeVaga(randomUUID().slice(0, 8)))
    expect(criada.ok).toBe(true)
    if (!criada.ok) return
    criadas.push(criada.data.id)

    await entrarComo('moderator')
    const publicada = await publicarVaga({ id: criada.data.id })

    expect(publicada).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })
})

describe('excluirVaga — papel mínimo admin', () => {
  it('nega o editor, que cria mas não apaga', async () => {
    await entrarComo('editor')
    const criada = await criarVaga(payloadDeVaga(randomUUID().slice(0, 8)))
    expect(criada.ok).toBe(true)
    if (!criada.ok) return
    criadas.push(criada.data.id)

    const excluida = await excluirVaga({ id: criada.data.id })
    expect(excluida).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('deixa o admin apagar rascunho', async () => {
    await entrarComo('editor')
    const criada = await criarVaga(payloadDeVaga(randomUUID().slice(0, 8)))
    expect(criada.ok).toBe(true)
    if (!criada.ok) return

    await entrarComo('admin')
    const excluida = await excluirVaga({ id: criada.data.id })
    expect(excluida.ok).toBe(true)

    const restantes = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.id, criada.data.id))

    expect(restantes).toHaveLength(0)
  })
})

describe('definirPapel — papel mínimo admin', () => {
  it('nega o editor', async () => {
    await entrarComo('editor')
    const resultado = await definirPapel({
      userId: '00000000-0000-4000-8000-000000000004',
      role: 'editor',
    })

    expect(resultado).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('deixa o admin promover outra pessoa, e devolve o papel depois', async () => {
    await entrarComo('admin')
    const leitor = '00000000-0000-4000-8000-000000000004'

    const promovido = await definirPapel({ userId: leitor, role: 'editor' })
    expect(promovido.ok).toBe(true)

    const [perfil] = await db
      .select({ role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, leitor))
    expect(perfil?.role).toBe('editor')

    const devolvido = await definirPapel({ userId: leitor, role: 'reader' })
    expect(devolvido.ok).toBe(true)
  })

  it('impede o admin de mudar o próprio papel', async () => {
    await entrarComo('admin')
    const resultado = await definirPapel({
      userId: '00000000-0000-4000-8000-000000000001',
      role: 'reader',
    })

    expect(resultado).toMatchObject({ ok: false, error: { code: 'validation_error' } })
  })
})

describe('salvarEmpresa — papel mínimo editor', () => {
  it('nega quem só lê', async () => {
    await entrarComo('reader')
    const resultado = await salvarEmpresa({ name: 'Empresa de Teste' })

    expect(resultado).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })
})
