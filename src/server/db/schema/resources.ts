// Test resources, calendars, rules and bookings (docs/spec/02 §1–3, §5; delivery 2). Indicators are computed from these rows,
// never stored (spec 02 §6).
import { boolean, date, index, integer, primaryKey, smallint, text, timestamp, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { BookingStatus, Granularity, ResourceKind, ResourceStatus, RuleReason, RuleStatus, UnavailabilityKind } from '@/domain/resources';
import { crucible } from './_schema';
import { id, timestamps } from './_common';
import { testNeeds } from './needs';
import { entities, facilities, projects, users } from './organisation';

export const resources = crucible.table('resources', {
  id: id(),
  /** Short code, e.g. "PDE-PIL". */
  code: text('code').notNull().unique(),
  facilityCode: text('facility_code').notNull().references(() => facilities.code),
  name: text('name').notNull(),
  kind: text('kind').$type<ResourceKind>().notNull(),
  granularity: text('granularity').$type<Granularity>().notNull().default('half_day'),
  /** Tests at the same time (1 for a bench or a zone). */
  capacity: smallint('capacity').notNull().default(1),
  /** Default preparation and restoring times of a test (R-5), copied onto each booking. */
  setupMinutes: integer('setup_minutes').notNull().default(0),
  teardownMinutes: integer('teardown_minutes').notNull().default(0),
  status: text('status').$type<ResourceStatus>().notNull().default('in_service'),
  description: text('description'),
  ...timestamps,
}, (t) => [index('resources_facility_idx').on(t.facilityCode)]);

/** Opening hours of a facility per ISO weekday (R-9); a weekday without a row is closed. */
export const facilityHours = crucible.table('facility_hours', {
  facilityCode: text('facility_code').notNull().references(() => facilities.code, { onDelete: 'cascade' }),
  weekday: smallint('weekday').notNull(),
  opensAt: text('opens_at').notNull(),
  closesAt: text('closes_at').notNull(),
}, (t) => [primaryKey({ name: 'facility_hours_pk', columns: [t.facilityCode, t.weekday] })]);

/** Whole days a facility is closed (public holidays, shutdowns); `facility_code` null = every facility. */
export const closures = crucible.table('closures', {
  id: id(),
  facilityCode: text('facility_code').references(() => facilities.code, { onDelete: 'cascade' }),
  fromOn: date('from_on', { mode: 'string' }).notNull(),
  toOn: date('to_on', { mode: 'string' }).notNull(),
  label: text('label').notNull(),
  ...timestamps,
});

export const unavailabilities = crucible.table('unavailabilities', {
  id: id(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<UnavailabilityKind>().notNull(),
  label: text('label').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  /** `manual` (Crucible), later `vigie` (V-1) or `incident` (delivery 5). */
  source: text('source').notNull().default('manual'),
  createdByName: text('created_by_name').notNull(),
  ...timestamps,
}, (t) => [index('unavailabilities_resource_idx').on(t.resourceId, t.startsAt)]);

/** Periodic regulatory inspections of a resource (R-6), entered in Crucible until Vigie publishes them (S-4, V-1). */
export const inspections = crucible.table('inspections', {
  id: id(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  periodMonths: smallint('period_months').notNull(),
  lastOn: date('last_on', { mode: 'string' }).notNull(),
  codexRef: text('codex_ref'),
  active: boolean('active').notNull().default(true),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
}, (t) => [unique('inspections_resource_label_uq').on(t.resourceId, t.label)]);

/** Exclusion rules (R-2, R-3): of the resources named, at most `max_active` work at the same time. */
export const exclusionRules = crucible.table('exclusion_rules', {
  id: id(),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  maxActive: smallint('max_active').notNull().default(1),
  reason: text('reason').$type<RuleReason>().notNull(),
  motive: text('motive').notNull(),
  /** Codex reference of the risk analysis that founds the rule. */
  codexRef: text('codex_ref'),
  status: text('status').$type<RuleStatus>().notNull().default('proposed'),
  proposedByName: text('proposed_by_name').notNull(),
  validatedByName: text('validated_by_name'),
  validatedAt: timestamp('validated_at', { withTimezone: true }),
  retiredByName: text('retired_by_name'),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  retiredReason: text('retired_reason'),
  ...timestamps,
});

export const exclusionRuleResources = crucible.table('exclusion_rule_resources', {
  ruleId: uuid('rule_id').notNull().references(() => exclusionRules.id, { onDelete: 'cascade' }),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
}, (t) => [primaryKey({ name: 'exclusion_rule_resources_pk', columns: [t.ruleId, t.resourceId] })]);

/** Sharing agreement of a facility with a partner entity (A-3). */
export const entityAgreements = crucible.table('entity_agreements', {
  facilityCode: text('facility_code').notNull().references(() => facilities.code, { onDelete: 'cascade' }),
  entityCode: text('entity_code').notNull().references(() => entities.code),
  /** Days per month reserved to the entity; null = no quota. */
  quotaDaysPerMonth: smallint('quota_days_per_month'),
  /** Working days of notice asked for a request (F-5). */
  noticeWorkdays: smallint('notice_workdays').notNull().default(10),
  note: text('note'),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
}, (t) => [primaryKey({ name: 'entity_agreements_pk', columns: [t.facilityCode, t.entityCode] })]);

export const bookings = crucible.table('bookings', {
  id: id(),
  /** "B-2026-0042". */
  ref: text('ref').notNull().unique(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  projectCode: text('project_code').notNull().references(() => projects.code),
  /** Entity of the project when the booking was made. */
  entityCode: text('entity_code').notNull().references(() => entities.code),
  /** Purpose of the test, as typed. */
  title: text('title').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  setupMinutes: integer('setup_minutes').notNull().default(0),
  teardownMinutes: integer('teardown_minutes').notNull().default(0),
  status: text('status').$type<BookingStatus>().notNull().default('requested'),
  actualStartAt: timestamp('actual_start_at', { withTimezone: true }),
  actualEndAt: timestamp('actual_end_at', { withTimezone: true }),
  /** Operators as typed (F-7: planned with the resource from delivery 4). */
  operators: text('operators'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
  requestedByName: text('requested_by_name').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
  confirmedByName: text('confirmed_by_name'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  /** `crucible` or `import` (history, F-9). */
  source: text('source').notNull().default('crucible'),
  ...timestamps,
  /** The need the booking serves (delivery 3): its coverage and the load it leaves are computed from these links. */
  needId: uuid('need_id').references((): AnyPgColumn => testNeeds.id),
  /** Codex reference of the test report (P-4, S-6): Crucible keeps the reference, never the file. */
  codexRef: text('codex_ref'),
}, (t) => [index('bookings_resource_idx').on(t.resourceId, t.startsAt), index('bookings_project_idx').on(t.projectCode)]);
