// People, skills, substitutions, mobile equipment, priority rules, engine runs, conflicts and arbitrations (docs/spec/02 §1,
// §4–5, 03 §3–5; delivery 4). The engine proposes, a person decides: proposals and conflict sheets are stored so that a
// decision cites them; an arbitration is never changed (a new decision replaces it).
import { boolean, date, index, integer, jsonb, primaryKey, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { ConflictStatus, ProposalStatus, SubstitutionStatus } from '@/domain/planning-vocabulary';
import { crucible } from './_schema';
import { id, timestamps } from './_common';
import { testNeeds, testTypes } from './needs';
import { entities, facilities, users } from './organisation';
import { bookings, resources } from './resources';

/** Skills and authorisations the tests ask (pyrotechnician, workshop technician…); `cursus_titre_id` maps a Cursus title (S-3). */
export const skills = crucible.table('skills', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  /** `titre_id` of `cursus.pub_titres_detenus` ("habilitation.H0B0"), when Cursus holds it. */
  cursusTitreId: text('cursus_titre_id'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

/** People who run the tests (D-6): operators, technicians, pyrotechnicians. */
export const people = crucible.table('people', {
  id: id(),
  name: text('name').notNull(),
  entityCode: text('entity_code').notNull().references(() => entities.code),
  /** Cursus matricule, to read their titles and absences (S-3, CU-1). */
  matricule: text('matricule').unique(),
  /** Facilities the person works in (codes). */
  facilityCodes: text('facility_codes').array().notNull().default([]),
  userId: uuid('user_id').references(() => users.id),
  active: boolean('active').notNull().default(true),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
});

export const personSkills = crucible.table('person_skills', {
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  skillCode: text('skill_code').notNull().references(() => skills.code),
  /** Last day the skill may be used (expiry of an authorisation); null = no expiry. */
  validUntil: date('valid_until', { mode: 'string' }),
  /** `crucible` (entered) or `cursus` (read from pub_titres_detenus). */
  source: text('source').notNull().default('crucible'),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
}, (t) => [primaryKey({ name: 'person_skills_pk', columns: [t.personId, t.skillCode] })]);

/** Absences of a person (whole days), entered until Cursus publishes them (CU-1). */
export const personAbsences = crucible.table('person_absences', {
  id: id(),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  fromOn: date('from_on', { mode: 'string' }).notNull(),
  toOn: date('to_on', { mode: 'string' }).notNull(),
  source: text('source').notNull().default('crucible'),
  createdByName: text('created_by_name').notNull(),
  ...timestamps,
}, (t) => [index('person_absences_person_idx').on(t.personId, t.fromOn)]);

/** Skills a test type asks, and how many people holding each (F-7). */
export const testTypeSkills = crucible.table('test_type_skills', {
  testTypeCode: text('test_type_code').notNull().references(() => testTypes.code, { onDelete: 'cascade' }),
  skillCode: text('skill_code').notNull().references(() => skills.code),
  count: smallint('count').notNull().default(1),
}, (t) => [primaryKey({ name: 'test_type_skills_pk', columns: [t.testTypeCode, t.skillCode] })]);

/** People on a booking, and the skill each holds there. */
export const bookingStaff = crucible.table('booking_staff', {
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id),
  skillCode: text('skill_code').references(() => skills.code),
}, (t) => [primaryKey({ name: 'booking_staff_pk', columns: [t.bookingId, t.personId] }), index('booking_staff_person_idx').on(t.personId)]);

/** Shared movable equipment (R-8): instrumentation, high-speed camera, acquisition chain. */
export const mobileEquipment = crucible.table('mobile_equipment', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  /** Facility that keeps it. */
  facilityCode: text('facility_code').notNull().references(() => facilities.code),
  active: boolean('active').notNull().default(true),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
});

export const testTypeEquipment = crucible.table('test_type_equipment', {
  testTypeCode: text('test_type_code').notNull().references(() => testTypes.code, { onDelete: 'cascade' }),
  equipmentCode: text('equipment_code').notNull().references(() => mobileEquipment.code),
}, (t) => [primaryKey({ name: 'test_type_equipment_pk', columns: [t.testTypeCode, t.equipmentCode] })]);

export const bookingEquipment = crucible.table('booking_equipment', {
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  equipmentCode: text('equipment_code').notNull().references(() => mobileEquipment.code),
}, (t) => [primaryKey({ name: 'booking_equipment_pk', columns: [t.bookingId, t.equipmentCode] }), index('booking_equipment_code_idx').on(t.equipmentCode)]);

/**
 * A test type done on another resource than its nominal one (R-4): proposed, validated by the host facility's manager with the
 * technical referent named and the Codex justification, and by the safety officer when hazardous matter is involved. Only a
 * validated substitution is ever proposed by the engine.
 */
export const substitutions = crucible.table('substitutions', {
  id: id(),
  testTypeCode: text('test_type_code').notNull().references(() => testTypes.code),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  conditions: text('conditions').notNull(),
  codexRef: text('codex_ref').notNull(),
  technicalReferent: text('technical_referent').notNull(),
  hazardous: boolean('hazardous').notNull().default(false),
  status: text('status').$type<SubstitutionStatus>().notNull().default('proposed'),
  proposedByName: text('proposed_by_name').notNull(),
  hostValidatedByName: text('host_validated_by_name'),
  hostValidatedAt: timestamp('host_validated_at', { withTimezone: true }),
  safetyValidatedByName: text('safety_validated_by_name'),
  safetyValidatedAt: timestamp('safety_validated_at', { withTimezone: true }),
  retiredReason: text('retired_reason'),
  ...timestamps,
}, (t) => [unique('substitutions_type_resource_uq').on(t.testTypeCode, t.resourceId)]);

/** Versions of the priority rules (A-1, A-2): the order of the criteria, published by the R&D director. Never changed. */
export const priorityRuleSets = crucible.table('priority_rule_sets', {
  version: integer('version').primaryKey(),
  /** Criteria keys, first decides first. */
  criteria: text('criteria').array().notNull(),
  note: text('note'),
  publishedByName: text('published_by_name').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
});

/** A run of the engine (T-3): who, when, the rules version, the horizon and what it found. */
export const planRuns = crucible.table('plan_runs', {
  id: id(),
  /** "R-2026-0003". */
  ref: text('ref').notNull().unique(),
  ruleVersion: integer('rule_version').notNull().references(() => priorityRuleSets.version),
  fromOn: date('from_on', { mode: 'string' }).notNull(),
  toOn: date('to_on', { mode: 'string' }).notNull(),
  /** `manual` or `nightly` (F-3). */
  trigger: text('trigger').notNull(),
  runByName: text('run_by_name').notNull(),
  runAt: timestamp('run_at', { withTimezone: true }).notNull(),
  /** Counts and the unplaced needs with their reason. */
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull(),
});

export const proposals = crucible.table('proposals', {
  id: id(),
  runId: uuid('run_id').notNull().references(() => planRuns.id, { onDelete: 'cascade' }),
  needId: uuid('need_id').notNull().references(() => testNeeds.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  substitute: boolean('substitute').notNull().default(false),
  /** Working days after the need's deadline (0 = on time). */
  lateDays: smallint('late_days').notNull().default(0),
  staff: jsonb('staff').$type<{ personId: string; skillCode: string }[]>().notNull(),
  equipment: text('equipment').array().notNull().default([]),
  /** Why this slot: the criteria values and their order, in the rules version of the run. */
  explanation: jsonb('explanation').$type<Record<string, unknown>>().notNull(),
  status: text('status').$type<ProposalStatus>().notNull().default('proposed'),
  bookingId: uuid('booking_id').references(() => bookings.id),
  decidedByName: text('decided_by_name'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
}, (t) => [index('proposals_run_idx').on(t.runId)]);

/** A conflict sheet (spec 03 §5): the needs in competition, the options and their consequences, the rule, the recommendation. */
export const conflicts = crucible.table('conflicts', {
  id: id(),
  /** "C-2026-0002". */
  ref: text('ref').notNull().unique(),
  runId: uuid('run_id').notNull().references(() => planRuns.id),
  /** Sorted need ids in competition: the same pair is one open conflict. */
  needIds: uuid('need_ids').array().notNull(),
  /** Exclusion rule or resource where they compete. */
  subject: text('subject').notNull(),
  options: jsonb('options').$type<Record<string, unknown>[]>().notNull(),
  recommendedKey: text('recommended_key').notNull(),
  /** The priority rule that orders the needs, and its rank in the rules version of the run. */
  ruleCited: text('rule_cited').notNull(),
  ruleRank: smallint('rule_rank'),
  ruleVersion: integer('rule_version').notNull(),
  /** `coordinator` or `rd_director` (A-4). */
  decider: text('decider').notNull(),
  /** A-6: decision expected within 2 working days. */
  dueOn: date('due_on', { mode: 'string' }).notNull(),
  status: text('status').$type<ConflictStatus>().notNull().default('open'),
  ...timestamps,
}, (t) => [index('conflicts_status_idx').on(t.status)]);

/** A decision on a conflict, or a safety veto (A-4). Append-only: a new decision replaces the previous one. */
export const arbitrations = crucible.table('arbitrations', {
  id: id(),
  conflictId: uuid('conflict_id').notNull().references(() => conflicts.id),
  /** `decision` or `veto`. */
  kind: text('kind').notNull(),
  optionKey: text('option_key'),
  /** Need ids in the order decided: the engine places them in this order from then on. */
  order: uuid('order').array().notNull().default([]),
  ruleInvoked: text('rule_invoked').notNull(),
  reason: text('reason').notNull(),
  decidedByName: text('decided_by_name').notNull(),
  decidedByRole: text('decided_by_role').notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
}, (t) => [index('arbitrations_conflict_idx').on(t.conflictId)]);
