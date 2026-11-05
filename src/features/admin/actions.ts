'use server';
// Administration Server Functions (docs/spec/01 §3, 05): accounts, role assignments, entities, sites, facilities and
// projects — the administrator only, except the projects, which the R&D director also records (priority class, A-5). Each one
// checks the viewer's active role server-side, validates its input with the pure rules of src/domain/admin.ts inside its
// transaction, writes, audits and revalidates the page.
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { RoleKey } from '@/config/roles';
import { checkAssignment, checkEntity, checkFacility, checkProject, checkSite, checkUser, selfLockout } from '@/domain/admin';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { entities, facilities, facilityPartners, projects, roleAssignments, sites, users } from '@/server/db/schema';
import { matrixReferentials, readMatrixEntities, readMatrixSites } from '@/server/integrations/connectors';
import type { Tx } from '@/server/db/types';
import { getViewer, type Viewer } from '@/server/session';

export type ActionResult = { ok: true } | { ok: false; error: string };

const fieldsOf = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
const audit = (v: Viewer, objectRef: string, change: string, extra: { entityType?: string; entityId?: string; after?: Record<string, unknown>; before?: Record<string, unknown> } = {}) => ({
  actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef, change, area: 'Administration', ...extra,
});

async function asRole(allowed: readonly RoleKey[]): Promise<Viewer | null> {
  const v = await getViewer();
  return allowed.includes(v.role) ? v : null;
}
const REFUSED: ActionResult = { ok: false, error: 'This action is reserved to the administrator' };

/** The Matrix code given (`matrixCode`), checked against Matrix's published list: null when none, false when unknown or taken. */
async function matrixCodeOf(tx: Tx, kind: 'site' | 'entity', fd: FormData): Promise<string | null | false> {
  const code = String(fd.get('matrixCode') ?? '').trim();
  if (!code) return null;
  const ref = await matrixReferentials(tx);
  const row = (kind === 'site' ? ref.sites : ref.subsidiaries).find((x) => x.code === code);
  return row && !row.linkedTo ? code : false;
}

/**
 * Links a site or an entity of Crucible to its Matrix site or subsidiary (CR-060, D14, D21), or unlinks it (empty code): its
 * name (and a site's city and country) then follow Matrix. The administrator only; audited.
 */
export async function linkMatrixAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await asRole(['admin']);
  if (!v) return REFUSED;
  const kind = fd.get('kind') === 'entity' ? 'entity' : fd.get('kind') === 'site' ? 'site' : null;
  const code = String(fd.get('code') ?? '');
  if (!kind) return REFUSED;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const table = kind === 'site' ? sites : entities;
    const [row] = await tx.select({ code: table.code, matrixCode: table.matrixCode }).from(table).where(eq(table.code, code));
    if (!row) return { ok: false, error: kind === 'site' ? 'Unknown site' : 'Unknown entity' };
    const m = await matrixCodeOf(tx, kind, fd);
    if (m === false) return { ok: false, error: kind === 'site' ? 'Choose a Matrix site not yet linked' : 'Choose a Matrix subsidiary not yet linked' };
    if (m === row.matrixCode) return { ok: true };
    await tx.update(table).set({ matrixCode: m, updatedAt: new Date() }).where(eq(table.code, code));
    await writeAudit(tx, audit(v, `${kind === 'site' ? 'Site' : 'Entity'} ${code}`, m ? `linked to Matrix ${m}` : 'unlinked from Matrix', { before: { matrixCode: row.matrixCode }, after: { matrixCode: m } }));
    // Its name follows Matrix at once.
    const by = { name: v.name, userId: v.userId, role: v.role };
    if (m) await (kind === 'site' ? readMatrixSites(tx, by) : readMatrixEntities(tx, by));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/admin/organisation');
  return r;
}

export async function createUserAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await asRole(['admin']);
  if (!v) return REFUSED;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const taken = new Set((await tx.select({ e: users.email }).from(users)).map((x) => x.e));
    const ents = new Set((await tx.select({ c: entities.code }).from(entities)).map((x) => x.c));
    const c = checkUser(fieldsOf(fd), { takenEmails: taken, entities: ents });
    if (!c.ok) return c;
    const [u] = await tx.insert(users).values(c.value).returning({ id: users.id });
    await writeAudit(tx, audit(v, `User ${c.value.email}`, 'account created', { entityType: 'user', entityId: u.id, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/admin/users');
  return r;
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  const v = await asRole(['admin']);
  if (!v) return REFUSED;
  const lock = selfLockout({ actorUserId: v.userId, targetUserId: userId, actorAdminRoles: 0, deactivating: !active });
  if (lock) return { ok: false, error: lock };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) return { ok: false, error: 'Unknown account' };
    if (u.active === active) return { ok: true };
    await tx.update(users).set({ active, updatedAt: new Date() }).where(eq(users.id, userId));
    await writeAudit(tx, audit(v, `User ${u.email}`, active ? 'account reactivated' : 'account deactivated', { entityType: 'user', entityId: u.id }));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/admin/users');
  return r;
}

export async function addRoleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await asRole(['admin']);
  if (!v) return REFUSED;
  const userId = String(fd.get('userId') ?? '');
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) return { ok: false, error: 'Unknown account' };
    const [e, f, p, held] = await Promise.all([
      tx.select({ c: entities.code, k: entities.kind }).from(entities), tx.select({ c: facilities.code }).from(facilities), tx.select({ c: projects.code }).from(projects),
      tx.select({ role: roleAssignments.role, scopeRef: roleAssignments.scopeRef }).from(roleAssignments).where(eq(roleAssignments.userId, userId)),
    ]);
    const c = checkAssignment(fieldsOf(fd), { entities: new Map(e.map((x) => [x.c, x.k])), facilities: new Set(f.map((x) => x.c)), projects: new Set(p.map((x) => x.c)), held });
    if (!c.ok) return c;
    const [a] = await tx.insert(roleAssignments).values({ userId, ...c.value, createdByName: v.name }).returning({ id: roleAssignments.id });
    await writeAudit(tx, audit(v, `User ${u.email}`, `role added: ${c.value.role}${c.value.scopeRef ? ` · ${c.value.scopeRef}` : ''}`, { entityType: 'role_assignment', entityId: a.id, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/admin/users');
  return r;
}

export async function removeRoleAction(assignmentId: string): Promise<ActionResult> {
  const v = await asRole(['admin']);
  if (!v) return REFUSED;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [a] = await tx.select().from(roleAssignments).where(eq(roleAssignments.id, assignmentId));
    if (!a) return { ok: false, error: 'Unknown role assignment' };
    const mine = await tx.select({ id: roleAssignments.id }).from(roleAssignments).where(and(eq(roleAssignments.userId, v.userId), eq(roleAssignments.role, 'admin')));
    const lock = selfLockout({ actorUserId: v.userId, targetUserId: a.userId, removingRole: a.role, actorAdminRoles: mine.length });
    if (lock) return { ok: false, error: lock };
    const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, a.userId));
    await tx.delete(roleAssignments).where(eq(roleAssignments.id, assignmentId));
    await writeAudit(tx, audit(v, `User ${u.email}`, `role removed: ${a.role}${a.scopeRef ? ` · ${a.scopeRef}` : ''}`, { entityType: 'role_assignment', entityId: a.id, before: { role: a.role, scopeKind: a.scopeKind, scopeRef: a.scopeRef } }));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/admin/users');
  return r;
}

export async function createEntityAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await asRole(['admin']);
  if (!v) return REFUSED;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const c = checkEntity(fieldsOf(fd), new Set((await tx.select({ c: entities.code }).from(entities)).map((x) => x.c)));
    if (!c.ok) return c;
    const m = await matrixCodeOf(tx, 'entity', fd);
    if (m === false) return { ok: false, error: 'Choose a Matrix subsidiary not yet linked' };
    await tx.insert(entities).values({ ...c.value, matrixCode: m });
    await writeAudit(tx, audit(v, `Entity ${c.value.code}`, 'entity created', { after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/admin/organisation');
  return r;
}

export async function createSiteAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await asRole(['admin']);
  if (!v) return REFUSED;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const c = checkSite(fieldsOf(fd), new Set((await tx.select({ c: sites.code }).from(sites)).map((x) => x.c)));
    if (!c.ok) return c;
    const m = await matrixCodeOf(tx, 'site', fd);
    if (m === false) return { ok: false, error: 'Choose a Matrix site not yet linked' };
    await tx.insert(sites).values({ ...c.value, matrixCode: m });
    await writeAudit(tx, audit(v, `Site ${c.value.code}`, 'site created', { after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/admin/organisation');
  return r;
}

export async function createFacilityAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await asRole(['admin']);
  if (!v) return REFUSED;
  const raw: Record<string, unknown> = { ...fieldsOf(fd), partnerEntityCodes: fd.getAll('partnerEntityCodes').map(String) };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [taken, s, e] = await Promise.all([
      tx.select({ c: facilities.code }).from(facilities), tx.select({ c: sites.code }).from(sites), tx.select({ c: entities.code, k: entities.kind }).from(entities),
    ]);
    const c = checkFacility(raw, { taken: new Set(taken.map((x) => x.c)), sites: new Set(s.map((x) => x.c)), entities: new Map(e.map((x) => [x.c, x.k])) });
    if (!c.ok) return c;
    const { partnerEntityCodes, ...facility } = c.value;
    await tx.insert(facilities).values(facility);
    if (partnerEntityCodes.length) await tx.insert(facilityPartners).values(partnerEntityCodes.map((entityCode) => ({ facilityCode: facility.code, entityCode })));
    await writeAudit(tx, audit(v, `Facility ${facility.code}`, 'facility created', { after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/admin/organisation');
  return r;
}

/** A project (S-1): the administrator or the R&D director, who alone sets its priority class (A-1, A-5). */
export async function createProjectAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await asRole(['admin', 'rd_director']);
  if (!v) return { ok: false, error: 'This action is reserved to the R&D director and the administrator' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [taken, e] = await Promise.all([tx.select({ c: projects.code }).from(projects), tx.select({ c: entities.code }).from(entities)]);
    const c = checkProject(fieldsOf(fd), { taken: new Set(taken.map((x) => x.c)), entities: new Set(e.map((x) => x.c)) });
    if (!c.ok) return c;
    await tx.insert(projects).values(c.value);
    await writeAudit(tx, { ...audit(v, `Project ${c.value.code}`, 'project created', { after: { ...c.value } }), area: 'Projects', projectCode: c.value.code });
    return { ok: true };
  });
  if (r.ok) {
    revalidatePath('/admin/organisation');
    revalidatePath('/projects');
  }
  return r;
}
