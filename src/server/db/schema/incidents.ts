// Incidents, recovery scenarios and what-if simulations, urgencies, notifications and weekly snapshots (docs/spec/02 §5–6, 03
// §7, decisions A-8, F-8, X-4; delivery 5). A scenario moves nothing by itself: a person accepts it, and only then are the
// bookings moved, traced and their requesters notified. Weekly snapshots keep the history of the computed indicators (X-4).
import { date, index, integer, jsonb, real, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { IncidentKind, IncidentStatus, ScenarioKind, ScenarioStatus } from '@/domain/recovery-vocabulary';
import { crucible } from './_schema';
import { id, timestamps } from './_common';
import { testNeeds } from './needs';
import { users } from './organisation';
import { people } from './planning';
import { resources, unavailabilities } from './resources';

export const incidents = crucible.table('incidents', {
  id: id(),
  /** "AL-2026-0001". */
  ref: text('ref').notNull().unique(),
  kind: text('kind').$type<IncidentKind>().notNull(),
  /** Breakdown: the resource down; absence: the person absent; urgency: the urgent need. */
  resourceId: uuid('resource_id').references(() => resources.id),
  personId: uuid('person_id').references(() => people.id),
  needId: uuid('need_id').references(() => testNeeds.id),
  label: text('label').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  /** Expected end. */
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  /** The unavailability a breakdown puts on its resource. */
  unavailabilityId: uuid('unavailability_id').references(() => unavailabilities.id),
  status: text('status').$type<IncidentStatus>().notNull().default('open'),
  declaredByUserId: uuid('declared_by_user_id').references(() => users.id),
  declaredByName: text('declared_by_name').notNull(),
  declaredAt: timestamp('declared_at', { withTimezone: true }).notNull(),
  ...timestamps,
});

export const scenarios = crucible.table('scenarios', {
  id: id(),
  /** "S-2026-0001". */
  ref: text('ref').notNull().unique(),
  kind: text('kind').$type<ScenarioKind>().notNull(),
  incidentId: uuid('incident_id').references(() => incidents.id),
  /** A what-if simulation: its hypothesis as typed (resource, dates). */
  hypothesis: jsonb('hypothesis').$type<Record<string, unknown>>(),
  /** Bookings moved: before and after, people, substitute; or not placed with the reason. */
  moves: jsonb('moves').$type<Record<string, unknown>[]>().notNull(),
  /** Consequences per project and need: date and working days late, before and after. */
  impacts: jsonb('impacts').$type<Record<string, unknown>[]>().notNull(),
  ruleVersion: integer('rule_version').notNull(),
  status: text('status').$type<ScenarioStatus>().notNull(),
  createdByName: text('created_by_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  decidedByName: text('decided_by_name'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionReason: text('decision_reason'),
}, (t) => [index('scenarios_incident_idx').on(t.incidentId)]);

/** Notifications of a person (F-8): the bell, then the e-mail (sent by the worker when a transport is set). */
export const notifications = crucible.table('notifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  /** EN source text with typed references after " · " (translated segment by segment). */
  title: text('title').notNull(),
  href: text('href'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  emailedAt: timestamp('emailed_at', { withTimezone: true }),
}, (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)]);

/** Weekly snapshot of the utilisation of a resource (X-4), computed once the week is over; history, never recomputed. */
export const weeklySnapshots = crucible.table('weekly_snapshots', {
  monday: date('monday', { mode: 'string' }).notNull(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  netOpenHours: real('net_open_hours').notNull(),
  bookedHours: real('booked_hours').notNull(),
  realisedHours: real('realised_hours').notNull(),
  realisedWithPrepHours: real('realised_with_prep_hours').notNull(),
  blockedHours: real('blocked_hours').notNull(),
  noShows: integer('no_shows').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
}, (t) => [unique('weekly_snapshots_uq').on(t.monday, t.resourceId)]);
