import {
  boolean,
  char,
  customType,
  integer,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { jobStatus, salaryPeriod } from './enums'
import { profiles } from './admin'
import {
  contractTypes,
  roleCategories,
  seniorityLevels,
  tags,
  technologies,
  workModes,
} from './taxonomies'

/** Espelha companies, jobs e junções da migration 0004. */

// O Drizzle não tem tsvector nativo. A coluna é mantida por trigger e nunca
// escrita pela aplicação — aparece aqui só para o schema refletir o banco.
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
})

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  website: text('website'),
  logoUrl: text('logo_url'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Fábrica em vez de objeto: os construtores de coluna do Drizzle têm estado, e
// tabela e view precisam de instâncias próprias. É o que mantém a view
// `active_jobs` espelhando jobs por inteiro, sem duplicar a lista de colunas.
const jobColumns = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
  descriptionMd: text('description_md').notNull(),
  summary: text('summary'),

  roleCategoryId: uuid('role_category_id').references(() => roleCategories.id, {
    onDelete: 'set null',
  }),
  seniorityId: uuid('seniority_id').references(() => seniorityLevels.id, {
    onDelete: 'set null',
  }),
  workModeId: uuid('work_mode_id').references(() => workModes.id, {
    onDelete: 'set null',
  }),
  contractTypeId: uuid('contract_type_id').references(() => contractTypes.id, {
    onDelete: 'set null',
  }),

  locationCity: text('location_city'),
  locationState: text('location_state'),
  locationCountry: char('location_country', { length: 2 }),

  salaryMin: numeric('salary_min', { precision: 12, scale: 2 }),
  salaryMax: numeric('salary_max', { precision: 12, scale: 2 }),
  salaryCurrency: char('salary_currency', { length: 3 }),
  salaryPeriod: salaryPeriod('salary_period').notNull().default('month'),

  benefits: text('benefits').array().notNull().default([]),
  keywords: text('keywords').array().notNull().default([]),
  language: text('language').notNull().default('pt-BR'),

  sourceUrl: text('source_url').notNull(),
  sourceUrlHash: text('source_url_hash').notNull().unique(),
  sourceSite: text('source_site'),
  applyUrl: text('apply_url').notNull(),

  status: jobStatus('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),

  viewsCount: integer('views_count').notNull().default(0),
  clicksCount: integer('clicks_count').notNull().default(0),

  search: tsvector('search'),

  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const jobs = pgTable('jobs', jobColumns())

export const jobTechnologies = pgTable(
  'job_technologies',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    technologyId: uuid('technology_id')
      .notNull()
      .references(() => technologies.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.technologyId] })],
)

export const jobTags = pgTable(
  'job_tags',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.tagId] })],
)

/** View da migration 0007: `select * from jobs where status = 'published'`. */
export const activeJobs = pgView('active_jobs', jobColumns()).existing()

export type Company = typeof companies.$inferSelect
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type JobTechnology = typeof jobTechnologies.$inferSelect
export type JobTag = typeof jobTags.$inferSelect
