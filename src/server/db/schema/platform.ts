// Platform tables copied from Keystone (docs/SOCLE.md): settings, the append-only audit trail (trigger in the initial
// migration) and the activity feed.
import { index, integer, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { crucible } from './_schema';
import { id } from './_common';
import { projects, users } from './organisation';

export const appSettings = crucible.table('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedByName: text('updated_by_name').notNull(),
});

/** Append-only (database trigger): never updated nor deleted, in code or tests. */
export const auditEntries = crucible.table('audit_entries', {
  id: id(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  /** The user account that acted; null for systems (jobs, connectors). */
  actorUserId: uuid('actor_user_id').references(() => users.id),
  /** Display name of the actor (user or system). */
  actorName: text('actor_name').notNull(),
  /** Active role of the actor when they acted. */
  actorRole: text('actor_role'),
  /** Business reference of the object: "RD-ORION", "User n.diallo@…", "Role assignment". */
  objectRef: text('object_ref').notNull(),
  /** "status: Draft → Active" (EN source text). */
  change: text('change').notNull(),
  /** "Sign-in", "Administration", "Facilities"… */
  area: text('area').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  projectCode: text('project_code').references(() => projects.code),
  before: jsonb('before').$type<Record<string, unknown>>(),
  after: jsonb('after').$type<Record<string, unknown>>(),
  reason: text('reason'),
}, (t) => [
  /** pub_journal (Matrix) is read by period. */
  index('audit_entries_occurred_at_idx').on(t.occurredAt),
]);

export const activityEvents = crucible.table('activity_events', {
  id: id(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  actorName: text('actor_name').notNull(),
  kind: text('kind').notNull(),
  /** EN source sentence. */
  text: text('text').notNull(),
  projectCode: text('project_code').references(() => projects.code),
}, (t) => [index('activity_events_occurred_at_idx').on(t.occurredAt)]);

/** Scheduled jobs (src/server/jobs): last run and a lease, so that several runners never run the same job at once. */
export const jobRuns = crucible.table('job_runs', {
  name: text('name').primaryKey(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  lastStartedAt: timestamp('last_started_at', { withTimezone: true }),
  lastFinishedAt: timestamp('last_finished_at', { withTimezone: true }),
  lastStatus: text('last_status').$type<'ok' | 'error'>(),
  lastError: text('last_error'),
});

/** Counts of requests per bucket, key (account or address) and fixed window (CR-079); old windows purged daily. */
export const rateCounters = crucible.table('rate_counters', {
  bucket: text('bucket').notNull(),
  key: text('key').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [primaryKey({ name: 'rate_counters_pk', columns: [t.bucket, t.key, t.windowStart] }), index('rate_counters_window_idx').on(t.windowStart)]);
