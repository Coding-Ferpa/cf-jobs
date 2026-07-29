'use server'

import { and, eq, ne } from 'drizzle-orm'

import { defineAction, FalhaDaAction } from '@/actions/define-action'
import { tabelaDaTaxonomia } from '@/db/queries/admin'
import { companies, profiles } from '@/db/schema'
import {
  desativarTaxonomiaSchema,
  empresaSchema,
  papelSchema,
  taxonomiaSchema,
} from '@/lib/schemas/admin'
import { kebab } from '@/lib/slug'

import type { Transaction } from '@/db/client'

/**
 * Empresas, taxonomias e papéis (doc 06). Mesmo esqueleto do CRUD de vagas.
 *
 * Taxonomia e empresa mudam o que a área pública mostra em filtro e card, então
 * as duas derrubam a tag `jobs`.
 */

const TAGS_DE_CACHE = ['jobs']

/**
 * Slug único a partir do rótulo, com sufixo numérico em caso de colisão.
 * O slug entra em URL de filtro e não muda depois de criado.
 */
async function slugDisponivel(
  tx: Transaction,
  tabela: ReturnType<typeof tabelaDaTaxonomia> | typeof companies,
  base: string,
): Promise<string> {
  const raiz = kebab(base)
  if (raiz.length === 0) {
    throw new FalhaDaAction('validation_error', 'O rótulo precisa de letras ou números.')
  }

  for (let sufixo = 0; sufixo < 50; sufixo++) {
    const candidato = sufixo === 0 ? raiz : `${raiz}-${sufixo + 1}`
    const [existente] = await tx
      .select({ id: tabela.id })
      .from(tabela)
      .where(eq(tabela.slug, candidato))
      .limit(1)

    if (!existente) return candidato
  }

  throw new FalhaDaAction(
    'validation_error',
    'Já existem registros demais com esse nome.',
  )
}

export const salvarEmpresa = defineAction({
  nome: 'company.upsert',
  entidade: 'company',
  papelMinimo: 'editor',
  schema: empresaSchema,
  revalidar: TAGS_DE_CACHE,
  async executar({ entrada, tx }) {
    const campos = {
      name: entrada.name,
      website: entrada.website,
      logoUrl: entrada.logoUrl,
      description: entrada.description,
    }

    if (entrada.id) {
      const [atualizada] = await tx
        .update(companies)
        .set(campos)
        .where(eq(companies.id, entrada.id))
        .returning({ id: companies.id, slug: companies.slug })

      if (!atualizada) throw new FalhaDaAction('not_found', 'Empresa não encontrada.')

      return {
        data: atualizada,
        entityId: entrada.id,
        diff: { atualizada: campos },
      }
    }

    const slug = await slugDisponivel(tx, companies, entrada.name)

    const [criada] = await tx
      .insert(companies)
      .values({ ...campos, slug })
      .returning({ id: companies.id, slug: companies.slug })

    if (!criada) throw new FalhaDaAction('not_found', 'Não conseguimos criar a empresa.')

    return { data: criada, entityId: criada.id, diff: { criada: { ...campos, slug } } }
  },
})

export const salvarTaxonomia = defineAction({
  nome: 'taxonomy.upsert',
  entidade: 'taxonomy',
  papelMinimo: 'editor',
  schema: taxonomiaSchema,
  revalidar: TAGS_DE_CACHE,
  async executar({ entrada, tx }) {
    const tabela = tabelaDaTaxonomia(entrada.kind)

    // Colunas que só existem em uma tabela entram condicionalmente: `kind` em
    // technologies, `rank` em seniority_levels.
    const especificos = {
      ...(entrada.kind === 'technology' && entrada.technologyKind
        ? { kind: entrada.technologyKind }
        : {}),
      ...(entrada.kind === 'seniority' ? { rank: entrada.rank ?? 0 } : {}),
    }

    const campos = {
      label: entrada.label,
      aliases: entrada.aliases,
      sortOrder: entrada.sortOrder,
      ...especificos,
    }

    if (entrada.id) {
      const [atualizada] = await tx
        .update(tabela)
        .set(campos)
        .where(eq(tabela.id, entrada.id))
        .returning({ id: tabela.id, slug: tabela.slug })

      if (!atualizada) throw new FalhaDaAction('not_found', 'Registro não encontrado.')

      return {
        data: atualizada,
        entityId: entrada.id,
        diff: { kind: entrada.kind, atualizada: campos },
      }
    }

    const slug = await slugDisponivel(tx, tabela, entrada.label)

    const [criada] = await tx
      .insert(tabela)
      .values({ ...campos, slug })
      .returning({ id: tabela.id, slug: tabela.slug })

    if (!criada) throw new FalhaDaAction('not_found', 'Não conseguimos criar o registro.')

    return {
      data: criada,
      entityId: criada.id,
      diff: { kind: entrada.kind, criada: { ...campos, slug } },
    }
  },
})

/**
 * Nunca apaga: desativar preserva o vínculo das vagas que já usam a taxonomia
 * (doc 06). Reativar é a mesma action com `isActive: true`.
 */
export const alternarTaxonomia = defineAction({
  nome: 'taxonomy.toggle_active',
  entidade: 'taxonomy',
  papelMinimo: 'editor',
  schema: desativarTaxonomiaSchema,
  revalidar: TAGS_DE_CACHE,
  async executar({ entrada, tx }) {
    const tabela = tabelaDaTaxonomia(entrada.kind)

    const [linha] = await tx
      .update(tabela)
      .set({ isActive: entrada.isActive })
      .where(eq(tabela.id, entrada.id))
      .returning({ id: tabela.id, slug: tabela.slug, isActive: tabela.isActive })

    if (!linha) throw new FalhaDaAction('not_found', 'Registro não encontrado.')

    return {
      data: linha,
      entityId: entrada.id,
      diff: { kind: entrada.kind, slug: linha.slug, isActive: entrada.isActive },
    }
  },
})

export const definirPapel = defineAction({
  nome: 'user.set_role',
  entidade: 'profile',
  papelMinimo: 'admin',
  schema: papelSchema,
  async executar({ entrada, usuario, tx }) {
    if (entrada.userId === usuario.id) {
      // Sem isso, um admin distraído se rebaixa e ninguém mais promove.
      throw new FalhaDaAction(
        'validation_error',
        'Você não pode mudar o próprio papel. Peça a outra pessoa com acesso de administração.',
      )
    }

    const [anterior] = await tx
      .select({ role: profiles.role, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, entrada.userId))
      .limit(1)

    if (!anterior) throw new FalhaDaAction('not_found', 'Pessoa não encontrada.')

    if (anterior.role === 'admin' && entrada.role !== 'admin') {
      const [outroAdmin] = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.role, 'admin'), ne(profiles.id, entrada.userId)))
        .limit(1)

      if (!outroAdmin) {
        throw new FalhaDaAction(
          'validation_error',
          'Esta é a última pessoa com acesso de administração. Promova outra antes.',
        )
      }
    }

    await tx
      .update(profiles)
      .set({ role: entrada.role })
      .where(eq(profiles.id, entrada.userId))

    return {
      data: { role: entrada.role },
      entityId: entrada.userId,
      diff: { pessoa: anterior.displayName, de: anterior.role, para: entrada.role },
    }
  },
})
