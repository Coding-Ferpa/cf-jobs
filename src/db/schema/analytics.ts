import {
  bigint,
  date,
  integer,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { eventType } from './enums'
import { jobs } from './jobs'

/** Espelha job_events e job_stats_daily (0006) e a view do dashboard (0007). */

export const jobEvents = pgTable('job_events', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  eventType: eventType('event_type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  /** Dia em UTC, usado pelo índice de dedup e pelo rollup. */
  occurredOn: date('occurred_on').notNull(),
  referrer: text('referrer'),
  utmSource: text('utm_source'),
  /** sha256 de IP + user agent + dia + salt. Nunca guardamos IP. */
  visitorHash: text('visitor_hash'),
})

export const jobStatsDaily = pgTable(
  'job_stats_daily',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    views: integer('views').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    shares: integer('shares').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.day] })],
)

export const dashboardSummary = pgView('v_dashboard_summary', {
  jobsPublished: bigint('jobs_published', { mode: 'number' }),
  jobsPendingReview: bigint('jobs_pending_review', { mode: 'number' }),
  jobsDraft: bigint('jobs_draft', { mode: 'number' }),
  jobsArchived: bigint('jobs_archived', { mode: 'number' }),
  jobsRejected: bigint('jobs_rejected', { mode: 'number' }),
  importsFailed: bigint('imports_failed', { mode: 'number' }),
  importsInReview: bigint('imports_in_review', { mode: 'number' }),
  importsCompleted: bigint('imports_completed', { mode: 'number' }),
  avgImportLatencyMs: integer('avg_import_latency_ms'),
  avgImportTokens: integer('avg_import_tokens'),
  suggestionsPending: bigint('suggestions_pending', { mode: 'number' }),
}).existing()

export type JobEvent = typeof jobEvents.$inferSelect
export type NewJobEvent = typeof jobEvents.$inferInsert
export type JobStatsDaily = typeof jobStatsDaily.$inferSelect
