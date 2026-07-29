import { pgEnum } from 'drizzle-orm/pg-core'

/** Espelha os enums da migration 0002. */

export const userRole = pgEnum('user_role', ['admin', 'editor', 'moderator', 'reader'])

export const jobStatus = pgEnum('job_status', [
  'draft',
  'pending_review',
  'published',
  'archived',
  'rejected',
])

export const importStatus = pgEnum('import_status', [
  'queued',
  'fetching',
  'extracting',
  'classifying',
  'mapping',
  'review',
  'completed',
  'failed',
])

export const technologyKind = pgEnum('technology_kind', [
  'language',
  'framework',
  'database',
  'cloud',
  'tool',
])

export const salaryPeriod = pgEnum('salary_period', ['hour', 'month', 'year'])

export const eventType = pgEnum('event_type', ['view', 'click_apply', 'share'])

export const suggestionStatus = pgEnum('suggestion_status', [
  'pending',
  'approved',
  'rejected',
  'merged',
])
