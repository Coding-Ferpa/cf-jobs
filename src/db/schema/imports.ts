import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { importStatus, suggestionStatus } from './enums'
import { jobs } from './jobs'
import { profiles } from './admin'

/** Espelha job_imports e taxonomy_suggestions da migration 0005. */

export const jobImports = pgTable('job_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  urlHash: text('url_hash').notNull(),
  status: importStatus('status').notNull().default('queued'),
  sourceSite: text('source_site'),

  rawContent: text('raw_content'),
  aiResponse: jsonb('ai_response'),

  errorStep: text('error_step'),
  errorMessage: text('error_message'),

  model: text('model'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  latencyMs: integer('latency_ms'),
  attempt: integer('attempt').notNull().default(1),

  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  requestedBy: uuid('requested_by').references(() => profiles.id, {
    onDelete: 'set null',
  }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export const taxonomySuggestions = pgTable('taxonomy_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  suggestedLabel: text('suggested_label').notNull(),
  normalizedSlug: text('normalized_slug').notNull(),
  context: text('context'),
  importId: uuid('import_id').references(() => jobImports.id, {
    onDelete: 'set null',
  }),
  status: suggestionStatus('status').notNull().default('pending'),
  // Sem FK: aponta para a lookup indicada por `kind`.
  resolvedTaxonomyId: uuid('resolved_taxonomy_id'),
  reviewedBy: uuid('reviewed_by').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
})

export type JobImport = typeof jobImports.$inferSelect
export type NewJobImport = typeof jobImports.$inferInsert
export type TaxonomySuggestion = typeof taxonomySuggestions.$inferSelect
export type NewTaxonomySuggestion = typeof taxonomySuggestions.$inferInsert
