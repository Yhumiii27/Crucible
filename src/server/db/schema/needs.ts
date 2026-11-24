// Milestones of the projects, the test type catalogue and the test needs (docs/spec/02 §3, 03 §6; delivery 3). How much of a
// need is booked, and the load it puts on its resource, are computed from the bookings linked to it — never stored.
import { boolean, date, index, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { MilestoneCriticality, MilestoneSource, NeedLevel, NeedStatus } from '@/domain/needs';
import { crucible } from './_schema';
import { id, timestamps } from './_common';
import { CODE_RE, MILESTONE_CRITICALITIES, MILESTONE_SOURCES, NEED_LEVELS, NEED_STATUSES, filled, oneOf, refRe, rule, shaped, within } from './_checks';
import { projects, users } from './organisation';
import { resources } from './resources';

export const projectMilestones = crucible.table('project_milestones', {
  id: id(),
  projectCode: text('project_code').notNull().references(() => projects.code),
  label: text('label').notNull(),
  dueOn: date('due_on', { mode: 'string' }).notNull(),
  criticality: text('criticality').$type<MilestoneCriticality>().notNull().default('internal'),
  /** `crucible` (entered here, S-1) until Keystone publishes its milestones (`keystone`, K-2). */
  source: text('source').$type<MilestoneSource>().notNull().default('crucible'),
  /** Reference of the milestone in its source tool, when read from it. */
  sourceRef: text('source_ref'),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
}, (t) => [
  index('project_milestones_project_idx').on(t.projectCode, t.dueOn),
  filled('project_milestones_label_filled', t.label),
  oneOf('project_milestones_criticality_domain', t.criticality, MILESTONE_CRITICALITIES),
  oneOf('project_milestones_source_domain', t.source, MILESTONE_SOURCES),
  filled('project_milestones_updated_by_filled', t.updatedByName),
]);

/** Test types of the R&D catalogue (D-3); the skills are typed until Cursus publishes them (S-3, delivery 4). */
export const testTypes = crucible.table('test_types', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  nominalResourceId: uuid('nominal_resource_id').references(() => resources.id),
  typicalHalfDays: smallint('typical_half_days').notNull().default(2),
  skills: text('skills'),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
}, (t) => [
  shaped('test_types_code_shape', t.code, CODE_RE),
  filled('test_types_name_filled', t.name),
  within('test_types_half_days_positive', t.typicalHalfDays, 1, null),
  filled('test_types_updated_by_filled', t.updatedByName),
]);

export const testNeeds = crucible.table('test_needs', {
  id: id(),
  /** "N-2026-0007". */
  ref: text('ref').notNull().unique(),
  projectCode: text('project_code').notNull().references(() => projects.code),
  milestoneId: uuid('milestone_id').references(() => projectMilestones.id),
  testTypeCode: text('test_type_code').references(() => testTypes.code),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  /** `forecast`: an envelope; `request`: a detailed test (spec 03 §6). */
  level: text('level').$type<NeedLevel>().notNull(),
  /** What the tests are for, as typed. */
  title: text('title').notNull(),
  halfDays: smallint('half_days').notNull(),
  earliestOn: date('earliest_on', { mode: 'string' }).notNull(),
  deadlineOn: date('deadline_on', { mode: 'string' }).notNull(),
  /** Codex reference of the test protocol (S-6). */
  codexRef: text('codex_ref'),
  note: text('note'),
  status: text('status').$type<NeedStatus>().notNull().default('open'),
  withdrawnReason: text('withdrawn_reason'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
  requestedByName: text('requested_by_name').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
  ...timestamps,
}, (t) => [
  index('test_needs_project_idx').on(t.projectCode),
  index('test_needs_resource_idx').on(t.resourceId, t.deadlineOn),
  shaped('test_needs_ref_shape', t.ref, refRe('N')),
  oneOf('test_needs_level_domain', t.level, NEED_LEVELS),
  filled('test_needs_title_filled', t.title),
  within('test_needs_half_days_positive', t.halfDays, 1, null),
  rule('test_needs_dates_order', sql`${t.deadlineOn} >= ${t.earliestOn}`),
  oneOf('test_needs_status_domain', t.status, NEED_STATUSES),
  filled('test_needs_requested_by_filled', t.requestedByName),
]);
