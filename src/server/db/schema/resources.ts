// Test resources, calendars, rules and bookings (docs/spec/02 §1–3, §5; delivery 2). Indicators are computed from these rows,
// never stored (spec 02 §6).
import { boolean, date, index, integer, primaryKey, smallint, text, timestamp, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { BookingStatus, Granularity, ResourceKind, ResourceStatus, RuleReason, RuleStatus, UnavailabilityKind } from '@/domain/resources';
import { crucible } from './_schema';
import { id, timestamps } from './_common';
import { BOOKING_SOURCES, BOOKING_STATUSES, CODE_RE, GRANULARITIES, INSPECTION_SOURCES, RESOURCE_KINDS, RESOURCE_STATUSES, RULE_REASONS, RULE_STATUSES, TIME_RE, UNAVAILABILITY_KINDS, UNAVAILABILITY_SOURCES, filled, oneOf, refRe, rule, shaped, within } from './_checks';
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
  /** Limits of a booking of the resource (CR-078, X-11), checked as hard constraints: free time kept between two bookings… */
  bufferMinutes: integer('buffer_minutes').notNull().default(0),
  /** …least notice of a new request, in hours (null = none beyond the entity's agreement)… */
  minNoticeHours: integer('min_notice_hours'),
  /** …and most calendar days a booking may span (null = no limit). */
  maxDays: smallint('max_days'),
}, (t) => [
  index('resources_facility_idx').on(t.facilityCode),
  shaped('resources_code_shape', t.code, CODE_RE),
  filled('resources_name_filled', t.name),
  oneOf('resources_kind_domain', t.kind, RESOURCE_KINDS),
  oneOf('resources_granularity_domain', t.granularity, GRANULARITIES),
  within('resources_capacity_positive', t.capacity, 1, null),
  within('resources_setup_non_negative', t.setupMinutes, 0, null),
  within('resources_teardown_non_negative', t.teardownMinutes, 0, null),
  oneOf('resources_status_domain', t.status, RESOURCE_STATUSES),
  within('resources_buffer_non_negative', t.bufferMinutes, 0, null),
  within('resources_min_notice_non_negative', t.minNoticeHours, 0, null),
  within('resources_max_days_positive', t.maxDays, 1, null),
]);

/** Opening hours of a facility per ISO weekday (R-9); a weekday without a row is closed. */
export const facilityHours = crucible.table('facility_hours', {
  facilityCode: text('facility_code').notNull().references(() => facilities.code, { onDelete: 'cascade' }),
  weekday: smallint('weekday').notNull(),
  opensAt: text('opens_at').notNull(),
  closesAt: text('closes_at').notNull(),
}, (t) => [
  primaryKey({ name: 'facility_hours_pk', columns: [t.facilityCode, t.weekday] }),
  within('facility_hours_weekday_range', t.weekday, 1, 7),
  shaped('facility_hours_opens_shape', t.opensAt, TIME_RE),
  shaped('facility_hours_closes_shape', t.closesAt, TIME_RE),
  rule('facility_hours_order', sql`${t.closesAt} > ${t.opensAt}`),
]);

/** Whole days a facility is closed (public holidays, shutdowns); `facility_code` null = every facility. */
export const closures = crucible.table('closures', {
  id: id(),
  facilityCode: text('facility_code').references(() => facilities.code, { onDelete: 'cascade' }),
  fromOn: date('from_on', { mode: 'string' }).notNull(),
  toOn: date('to_on', { mode: 'string' }).notNull(),
  label: text('label').notNull(),
  ...timestamps,
}, (t) => [rule('closures_dates_order', sql`${t.toOn} >= ${t.fromOn}`), filled('closures_label_filled', t.label)]);

export const unavailabilities = crucible.table('unavailabilities', {
  id: id(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<UnavailabilityKind>().notNull(),
  label: text('label').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  /** `manual` (Crucible), `vigie` (an outside intervention read from Vigie, V-2 / M-21) or `incident` (delivery 5). */
  source: text('source').notNull().default('manual'),
  createdByName: text('created_by_name').notNull(),
  ...timestamps,
  /** For `vigie`: `suspension:<activite_id>` of vigie.pub_suspensions_essais. */
  sourceRef: text('source_ref'),
}, (t) => [
  index('unavailabilities_resource_idx').on(t.resourceId, t.startsAt),
  oneOf('unavailabilities_kind_domain', t.kind, UNAVAILABILITY_KINDS),
  filled('unavailabilities_label_filled', t.label),
  rule('unavailabilities_times_order', sql`${t.endsAt} >= ${t.startsAt}`),
  oneOf('unavailabilities_source_domain', t.source, UNAVAILABILITY_SOURCES),
  filled('unavailabilities_created_by_filled', t.createdByName),
]);

/** Zones of Vigie's site map (essais, atex) and the resources of Crucible each one holds (V-2): kept by the facility managers. */
export const vigieZoneResources = crucible.table('vigie_zone_resources', {
  zoneId: integer('zone_id').notNull(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  setByName: text('set_by_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ name: 'vigie_zone_resources_pk', columns: [t.zoneId, t.resourceId] }), filled('vigie_zone_resources_set_by_filled', t.setByName)]);

/** Periodic regulatory inspections of a resource (R-6), entered in Crucible or read from Vigie once it publishes them (S-4, V-1). */
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
  /** `crucible` (entered here) or `vigie` (read from `vigie.pub_controles`, CR-060: changed in Vigie only). */
  source: text('source').notNull().default('crucible'),
  /** `vigie_ref` of the control, when read from Vigie. */
  sourceRef: text('source_ref'),
}, (t) => [
  unique('inspections_resource_label_uq').on(t.resourceId, t.label),
  filled('inspections_label_filled', t.label),
  within('inspections_period_positive', t.periodMonths, 1, null),
  oneOf('inspections_source_domain', t.source, INSPECTION_SOURCES),
  filled('inspections_updated_by_filled', t.updatedByName),
]);

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
}, (t) => [
  shaped('exclusion_rules_code_shape', t.code, CODE_RE),
  filled('exclusion_rules_label_filled', t.label),
  within('exclusion_rules_max_active_positive', t.maxActive, 1, null),
  oneOf('exclusion_rules_reason_domain', t.reason, RULE_REASONS),
  filled('exclusion_rules_motive_filled', t.motive),
  oneOf('exclusion_rules_status_domain', t.status, RULE_STATUSES),
  rule('exclusion_rules_validated_dated', sql`${t.status} <> 'validated' or ${t.validatedAt} is not null`),
  rule('exclusion_rules_retired_dated', sql`${t.status} <> 'retired' or ${t.retiredAt} is not null`),
  filled('exclusion_rules_proposed_by_filled', t.proposedByName),
]);

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
}, (t) => [
  primaryKey({ name: 'entity_agreements_pk', columns: [t.facilityCode, t.entityCode] }),
  within('entity_agreements_quota_non_negative', t.quotaDaysPerMonth, 0, 31),
  within('entity_agreements_notice_non_negative', t.noticeWorkdays, 0, null),
  filled('entity_agreements_updated_by_filled', t.updatedByName),
]);

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
  /** Reference of the first booking of a weekly series (CR-078), on every booking of the series; null = a single booking. */
  seriesRef: text('series_ref'),
}, (t) => [
  index('bookings_resource_idx').on(t.resourceId, t.startsAt),
  index('bookings_project_idx').on(t.projectCode),
  shaped('bookings_ref_shape', t.ref, refRe('B')),
  filled('bookings_title_filled', t.title),
  rule('bookings_times_order', sql`${t.endsAt} > ${t.startsAt}`),
  within('bookings_setup_non_negative', t.setupMinutes, 0, null),
  within('bookings_teardown_non_negative', t.teardownMinutes, 0, null),
  oneOf('bookings_status_domain', t.status, BOOKING_STATUSES),
  rule('bookings_actual_order', sql`${t.actualEndAt} is null or ${t.actualStartAt} is null or ${t.actualEndAt} >= ${t.actualStartAt}`),
  filled('bookings_requested_by_filled', t.requestedByName),
  oneOf('bookings_source_domain', t.source, BOOKING_SOURCES),
  shaped('bookings_series_ref_shape', t.seriesRef, refRe('B')),
]);
