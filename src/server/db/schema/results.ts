// Results of the tests (CR-081, X-18): one or more versions per booking, kept as recorded (append-only, database triggers): a
// correction is a new version with its reason. Documents stay in Codex (references only); an ELN entry is an address.
import { index, integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { Measurement, ResultOutcome } from '@/domain/results';
import { crucible } from './_schema';
import { id } from './_common';
import { users } from './organisation';
import { bookings } from './resources';

export const testResults = crucible.table('test_results', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  /** 1, then 2, 3… for each correction. */
  version: integer('version').notNull(),
  outcome: text('outcome').$type<ResultOutcome>().notNull(),
  measurements: jsonb('measurements').$type<Measurement[]>().notNull(),
  /** As typed. */
  observations: text('observations'),
  /** Codex references of the raw data and of the lab notebook. */
  rawDataRef: text('raw_data_ref'),
  notebookRef: text('notebook_ref'),
  /** Address of the entry in the team's electronic lab notebook. */
  elnUrl: text('eln_url'),
  /** Why the previous version was corrected. */
  reason: text('reason'),
  recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
  recordedByName: text('recorded_by_name').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('test_results_booking_version_uq').on(t.bookingId, t.version), index('test_results_booking_idx').on(t.bookingId)]);
