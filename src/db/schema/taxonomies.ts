import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { technologyKind } from './enums'

/** Espelha as tabelas de lookup da migration 0003. */

const lookupColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  aliases: text('aliases').array().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}

export const roleCategories = pgTable('role_categories', lookupColumns)

export const seniorityLevels = pgTable('seniority_levels', {
  ...lookupColumns,
  /** Ordena de estágio a principal. */
  rank: integer('rank').notNull(),
})

export const workModes = pgTable('work_modes', lookupColumns)

export const contractTypes = pgTable('contract_types', lookupColumns)

export const technologies = pgTable('technologies', {
  ...lookupColumns,
  kind: technologyKind('kind').notNull(),
})

export const tags = pgTable('tags', lookupColumns)

export type RoleCategory = typeof roleCategories.$inferSelect
export type SeniorityLevel = typeof seniorityLevels.$inferSelect
export type WorkMode = typeof workModes.$inferSelect
export type ContractType = typeof contractTypes.$inferSelect
export type Technology = typeof technologies.$inferSelect
export type Tag = typeof tags.$inferSelect
