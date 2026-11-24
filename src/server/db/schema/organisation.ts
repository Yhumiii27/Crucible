// Organisation (docs/spec/02-objets.md §1, §3–4): entities (EPC2i, EPC France…), sites, facilities and the partner entities
// they are shared with, R&D projects (minimal record of delivery 1; needs and milestones come with delivery 3), users and
// their role assignments with a scope (docs/spec/01 §2).
import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { RoleKey, ScopeKind } from '@/config/roles';
import type { EntityKind, PriorityClass } from '@/domain/organisation';
import { crucible } from './_schema';
import { id, timestamps } from './_common';
import { CODE_RE, COUNTRY_RE, ENTITY_KINDS, PRIORITY_CLASSES, ROLE_KEYS, SCOPE_KINDS, filled, oneOf, rule, shaped } from './_checks';

export const entities = crucible.table('entities', {
  /** Short code, e.g. "EPC2I", "EPCFR". */
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  /** `internal`: the entity running Crucible; `partner`: an entity sharing some facilities (EPC France, A-3). */
  kind: text('kind').$type<EntityKind>().notNull(),
  active: boolean('active').notNull().default(true),
  ...timestamps,
  /** CR-060: the Matrix subsidiary (`matrix.pub_filiales.code`, D21) the entity is; its name then follows Matrix. */
  matrixCode: text('matrix_code').unique(),
}, (t) => [
  shaped('entities_code_shape', t.code, CODE_RE),
  filled('entities_name_filled', t.name),
  oneOf('entities_kind_domain', t.kind, ENTITY_KINDS),
  filled('entities_matrix_code_filled', t.matrixCode),
]);

export const sites = crucible.table('sites', {
  /** Short code; the Matrix site code once Matrix lists the site (M-6). */
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  city: text('city'),
  countryIso2: text('country_iso2').notNull().default('FR'),
  ...timestamps,
  /** CR-060: the Matrix site (`matrix.pub_sites.code`, D14) the site is; its name, city and country then follow Matrix. */
  matrixCode: text('matrix_code').unique(),
}, (t) => [
  shaped('sites_code_shape', t.code, CODE_RE),
  filled('sites_name_filled', t.name),
  shaped('sites_country_shape', t.countryIso2, COUNTRY_RE),
  filled('sites_matrix_code_filled', t.matrixCode),
]);

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
}, (t) => [
  shaped('facilities_code_shape', t.code, CODE_RE),
  filled('facilities_name_filled', t.name),
  rule('facilities_acquisition_non_negative', sql`${t.acquisitionKeur} >= 0`),
]);

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
  /** CR-060: the linked Keystone project is closed (pub_projets.imputable false); a person decides whether to set it aside. */
  keystoneClosed: boolean('keystone_closed').notNull().default(false),
}, (t) => [
  shaped('projects_code_shape', t.code, CODE_RE),
  filled('projects_name_filled', t.name),
  oneOf('projects_priority_class_domain', t.priorityClass, PRIORITY_CLASSES),
]);

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
  /**
   * Roles granted by the central sign-in (Clavis, read in clavis.pub_acces, CRUCIBLE_ACCESS_FROM_CLAVIS=on) at the last sign-in; null when Crucible alone
   * keeps the roles (Entra ID). With them, global roles apply directly and scoped assignments only for these roles.
   */
  grantedRoles: text('granted_roles').array().$type<RoleKey[]>(),
  ...timestamps,
}, (t) => [
  rule('users_email_shape', sql`${t.email} = lower(${t.email}) and ${t.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$'`),
  filled('users_display_name_filled', t.displayName),
  check('users_granted_roles_known', sql`${t.grantedRoles} is null or ${t.grantedRoles} <@ array['rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'technician', 'partner', 'viewer', 'admin']::text[]`),
]);

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
}, (t) => [
  index('role_assignments_user_idx').on(t.userId),
  oneOf('role_assignments_role_domain', t.role, ROLE_KEYS),
  oneOf('role_assignments_scope_kind_domain', t.scopeKind, SCOPE_KINDS),
  rule('role_assignments_scope_ref_iff_scoped', sql`(${t.scopeKind} = 'global') = (${t.scopeRef} is null)`),
  rule('role_assignments_dates_order', sql`${t.toOn} is null or ${t.fromOn} is null or ${t.toOn} >= ${t.fromOn}`),
  filled('role_assignments_created_by_filled', t.createdByName),
]);
