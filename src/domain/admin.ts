// Administration rules (docs/spec/01 §3, 05): the checks of the accounts, role assignments and organisation reference data
// (entities, sites, facilities, projects), pure so the Server Functions and the tests share them. Messages are EN source
// strings (translated by the page).
import { ROLE_SCOPE, isRoleKey, type RoleKey, type ScopeKind } from '@/config/roles';
import { normaliseEmail } from './auth';
import { ENTITY_KINDS, isPriorityClass, type EntityKind, type PriorityClass } from './organisation';

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const CODE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

export interface UserInput {
  email: string;
  displayName: string;
  jobTitle: string | null;
  entityCode: string | null;
}

/** A new account: a valid e-mail not taken yet, a name, an existing entity when one is given. */
export function checkUser(raw: Record<string, unknown>, ctx: { takenEmails: ReadonlySet<string>; entities: ReadonlySet<string> }): Check<UserInput> {
  const email = normaliseEmail(raw.email);
  if (!email) return { ok: false, error: 'Enter a valid e-mail address' };
  if (ctx.takenEmails.has(email)) return { ok: false, error: 'An account already has this e-mail address' };
  const displayName = text(raw.displayName);
  if (displayName.length < 2 || displayName.length > 120) return { ok: false, error: 'Enter the person’s name' };
  const entity = text(raw.entityCode).toUpperCase() || null;
  if (entity && !ctx.entities.has(entity)) return { ok: false, error: 'Unknown entity' };
  const jobTitle = text(raw.jobTitle).slice(0, 120) || null;
  return { ok: true, value: { email, displayName, jobTitle, entityCode: entity } };
}

export interface AssignmentInput {
  role: RoleKey;
  scopeKind: ScopeKind;
  scopeRef: string | null;
}

const CHOOSE: Record<Exclude<ScopeKind, 'global'>, string> = { entity: 'Choose an entity', facility: 'Choose a facility', project: 'Choose a project' };

/**
 * A role assignment: a known role, the scope its role takes, a reference that exists; a partner contact is given a partner
 * entity only (U-1).
 */
export function checkAssignment(
  raw: Record<string, unknown>,
  ctx: { entities: ReadonlyMap<string, EntityKind>; facilities: ReadonlySet<string>; projects: ReadonlySet<string>; held: readonly { role: string; scopeRef: string | null }[] },
): Check<AssignmentInput> {
  const role = text(raw.role);
  if (!isRoleKey(role)) return { ok: false, error: 'Choose a role' };
  const scopeKind = ROLE_SCOPE[role];
  let scopeRef: string | null = null;
  if (scopeKind !== 'global') {
    scopeRef = text(raw.scopeRef).toUpperCase() || null;
    const known = scopeKind === 'entity' ? ctx.entities.has(scopeRef ?? '') : scopeKind === 'facility' ? ctx.facilities.has(scopeRef ?? '') : ctx.projects.has(scopeRef ?? '');
    if (!scopeRef || !known) return { ok: false, error: CHOOSE[scopeKind] };
    if (role === 'partner' && ctx.entities.get(scopeRef) !== 'partner') return { ok: false, error: 'A partner contact is given a partner entity' };
  }
  if (ctx.held.some((h) => h.role === role && h.scopeRef === scopeRef)) return { ok: false, error: 'The person already holds this role on this scope' };
  return { ok: true, value: { role, scopeKind, scopeRef } };
}

/** An administrator never removes their own last administrator role, nor deactivates their own account. */
export function selfLockout(op: { actorUserId: string; targetUserId: string; removingRole?: string; actorAdminRoles: number; deactivating?: boolean }): string | null {
  if (op.actorUserId !== op.targetUserId) return null;
  if (op.deactivating) return 'You cannot deactivate your own account';
  if (op.removingRole === 'admin' && op.actorAdminRoles <= 1) return 'You cannot remove your own last administrator role';
  return null;
}

function checkCode(raw: unknown, taken: ReadonlySet<string>): Check<string> {
  const code = text(raw).toUpperCase();
  if (!CODE.test(code)) return { ok: false, error: 'The code has 2 to 20 letters, digits or dashes' };
  if (taken.has(code)) return { ok: false, error: 'This code is already used' };
  return { ok: true, value: code };
}

function checkName(raw: unknown, error: string): Check<string> {
  const name = text(raw);
  return name.length < 2 || name.length > 120 ? { ok: false, error } : { ok: true, value: name };
}

export function checkEntity(raw: Record<string, unknown>, taken: ReadonlySet<string>): Check<{ code: string; name: string; kind: EntityKind }> {
  const code = checkCode(raw.code, taken);
  if (!code.ok) return code;
  const name = checkName(raw.name, 'Enter the entity’s name');
  if (!name.ok) return name;
  const kind = text(raw.kind);
  if (!(ENTITY_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'Choose internal or partner' };
  return { ok: true, value: { code: code.value, name: name.value, kind: kind as EntityKind } };
}

export function checkSite(raw: Record<string, unknown>, taken: ReadonlySet<string>): Check<{ code: string; name: string; city: string | null; countryIso2: string }> {
  const code = checkCode(raw.code, taken);
  if (!code.ok) return code;
  const name = checkName(raw.name, 'Enter the site’s name');
  if (!name.ok) return name;
  const countryIso2 = text(raw.countryIso2).toUpperCase() || 'FR';
  if (!/^[A-Z]{2}$/.test(countryIso2)) return { ok: false, error: 'The country is a two-letter ISO code' };
  return { ok: true, value: { code: code.value, name: name.value, city: text(raw.city).slice(0, 80) || null, countryIso2 } };
}

export interface FacilityInput {
  code: string;
  name: string;
  siteCode: string;
  operatorEntityCode: string;
  description: string | null;
  partnerEntityCodes: string[];
}

/** A facility: on a known site, run by an internal entity, shared with partner entities only. */
export function checkFacility(
  raw: Record<string, unknown>,
  ctx: { taken: ReadonlySet<string>; sites: ReadonlySet<string>; entities: ReadonlyMap<string, EntityKind> },
): Check<FacilityInput> {
  const code = checkCode(raw.code, ctx.taken);
  if (!code.ok) return code;
  const name = checkName(raw.name, 'Enter the facility’s name');
  if (!name.ok) return name;
  const siteCode = text(raw.siteCode).toUpperCase();
  if (!ctx.sites.has(siteCode)) return { ok: false, error: 'Choose a site' };
  const operatorEntityCode = text(raw.operatorEntityCode).toUpperCase();
  if (ctx.entities.get(operatorEntityCode) !== 'internal') return { ok: false, error: 'Choose the internal entity that runs the facility' };
  const partners = Array.isArray(raw.partnerEntityCodes) ? raw.partnerEntityCodes : text(raw.partnerEntityCodes) ? [raw.partnerEntityCodes] : [];
  const partnerEntityCodes = [...new Set(partners.map((p) => text(p).toUpperCase()).filter(Boolean))].sort();
  if (partnerEntityCodes.some((p) => ctx.entities.get(p) !== 'partner')) return { ok: false, error: 'A facility is shared with partner entities only' };
  return { ok: true, value: { code: code.value, name: name.value, siteCode, operatorEntityCode, description: text(raw.description).slice(0, 500) || null, partnerEntityCodes } };
}

export interface ProjectInput {
  code: string;
  name: string;
  entityCode: string;
  priorityClass: PriorityClass;
  confidential: boolean;
  keystoneCode: string | null;
  codexProgramCode: string | null;
}

/** A project (S-1: entered in Crucible): an entity, a priority class (A-5), optional Keystone and Codex links. */
export function checkProject(raw: Record<string, unknown>, ctx: { taken: ReadonlySet<string>; entities: ReadonlySet<string> }): Check<ProjectInput> {
  const code = checkCode(raw.code, ctx.taken);
  if (!code.ok) return code;
  const name = checkName(raw.name, 'Enter the project’s name');
  if (!name.ok) return name;
  const entityCode = text(raw.entityCode).toUpperCase();
  if (!ctx.entities.has(entityCode)) return { ok: false, error: 'Choose an entity' };
  const priorityClass = text(raw.priorityClass).toUpperCase() || 'P2';
  if (!isPriorityClass(priorityClass)) return { ok: false, error: 'Choose a priority class' };
  const confidential = raw.confidential === true || raw.confidential === 'on' || raw.confidential === 'true';
  return {
    ok: true,
    value: { code: code.value, name: name.value, entityCode, priorityClass, confidential, keystoneCode: text(raw.keystoneCode).toUpperCase().slice(0, 40) || null, codexProgramCode: text(raw.codexProgramCode).toUpperCase().slice(0, 40) || null },
  };
}
