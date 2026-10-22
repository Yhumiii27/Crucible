// Organisation (docs/spec/02-objets.md §1, §3–4): entities (EPC2i, EPC France…), sites, facilities and the partner entities
// they are shared with, R&D projects (minimal record of delivery 1; needs and milestones come with delivery 3), users and
// their role assignments with a scope (docs/spec/01 §2).
import { boolean, date, index, integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { RoleKey, ScopeKind } from '@/config/roles';
import type { EntityKind, PriorityClass } from '@/domain/organisation';
import { crucible } from './_schema';
import { id, timestamps } from './_common';

export const entities = crucible.table('entities', {
  /** Short code, e.g. "EPC2I", "EPCFR". */
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  /** `internal`: the entity running Crucible; `partner`: an entity sharing some facilities (EPC France, A-3). */
  kind: text('kind').$type<EntityKind>().notNull(),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

export const sites = crucible.table('sites', {
  /** Short code; the Matrix site code once Matrix lists the site (M-6). */
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  city: text('city'),
  countryIso2: text('country_iso2').notNull().default('FR'),
  ...timestamps,
});

export const facilities = crucible.table('facilities', {
  /** Short code, e.g. "LAB67", "PDE". */
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  siteCode: text('site_code').notNull().references(() => sites.code),
  operatorEntityCode: text('operator_entity_code').notNull().references(() => entities.code),
  /** What is done there, as typed. */
  description: text('description'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
  /** Acquisition cost in k€, for the value of the unused capacity (spec 02 §6; the PDE: about 3 M€). */
  acquisitionKeur: integer('acquisition_keur'),
});

/** Partner entities a facility is shared with (laboratoire 67 → EPC France). */
export const facilityPartners = crucible.table('facility_partners', {
  facilityCode: text('facility_code').notNull().references(() => facilities.code, { onDelete: 'cascade' }),
  entityCode: text('entity_code').notNull().references(() => entities.code),
}, (t) => [primaryKey({ name: 'facility_partners_pk', columns: [t.facilityCode, t.entityCode] })]);

export const projects = crucible.table('projects', {
  /** Short code, e.g. "RD-ORION". */
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  entityCode: text('entity_code').notNull().references(() => entities.code),
  /** Priority class set by the R&D director, never by the requesting entity (A-1, A-5). */
  priorityClass: text('priority_class').$type<PriorityClass>().notNull().default('P2'),
  /** Shown as "Booked (confidential)" outside its team (U-3). */
  confidential: boolean('confidential').notNull().default(false),
  /** Keystone project (`pub_projets.code`) or Codex research programme, when they exist (S-1). */
  keystoneCode: text('keystone_code'),
  codexProgramCode: text('codex_program_code'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

export const users = crucible.table('users', {
  id: id(),
  /** Microsoft Entra object id, set at the first sign-in (null for demo users and accounts never used). */
  entraObjectId: text('entra_object_id').unique(),
  /** Sign-in e-mail, lower case. */
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  jobTitle: text('job_title'),
  /** Entity the person belongs to. */
  entityCode: text('entity_code').references(() => entities.code),
  active: boolean('active').notNull().default(true),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  ...timestamps,
});

export const roleAssignments = crucible.table('role_assignments', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').$type<RoleKey>().notNull(),
  scopeKind: text('scope_kind').$type<ScopeKind>().notNull(),
  /** Entity code, facility code or project code; null for a global assignment. */
  scopeRef: text('scope_ref'),
  fromOn: date('from_on', { mode: 'string' }),
  toOn: date('to_on', { mode: 'string' }),
  createdByName: text('created_by_name').notNull(),
  ...timestamps,
}, (t) => [index('role_assignments_user_idx').on(t.userId)]);
