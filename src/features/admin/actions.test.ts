// Administration Server Functions on a fresh PostgreSQL database, demo mode ("View as"): who may act, what is written, what
// is audited, and the self-lockout guard.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { and, desc, eq } from 'drizzle-orm';
import { auditEntries, entities, facilities, facilityPartners, projects, roleAssignments, sites, users } from '@/server/db/schema';
import { testDatabase, type TestDatabase } from '@/test/db';
import {
  addRoleAction, createEntityAction, createFacilityAction, createProjectAction, createSiteAction, createUserAction, removeRoleAction, setUserActiveAction,
} from './actions';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase();
});
afterAll(() => t.close());
beforeEach(() => jar.clear());

const as = (role: string) => jar.set('crucible-role', role);
const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
const lastAudit = async () => (await t.db.select().from(auditEntries).orderBy(desc(auditEntries.occurredAt)).limit(1))[0];
const userId = async (email: string) => (await t.db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0]?.id;

describe('administration actions', () => {
  it('are refused to every profile but the administrator', async () => {
    as('rd_director');
    expect(await createUserAction(null, form({ email: 'x@y.example', displayName: 'X Y' }))).toEqual({ ok: false, error: 'This action is reserved to the administrator' });
    as('coordinator');
    expect((await createFacilityAction(null, form({ code: 'ATM', name: 'Atelier', siteCode: 'RD-SITE', operatorEntityCode: 'EPC2I' }))).ok).toBe(false);
    expect(await userId('x@y.example')).toBeUndefined();
  });

  it('create an account, give and remove a role, deactivate and reactivate it — every step audited', async () => {
    as('admin');
    expect(await createUserAction(null, form({ email: 'Ana.Ruiz@epc2i.example', displayName: 'Ana Ruiz', entityCode: 'EPC2I', jobTitle: 'Test technician' }))).toEqual({ ok: true });
    const id = (await userId('ana.ruiz@epc2i.example'))!;
    expect(await lastAudit()).toMatchObject({ objectRef: 'User ana.ruiz@epc2i.example', change: 'account created', area: 'Administration', actorRole: 'admin' });
    expect(await createUserAction(null, form({ email: 'ana.ruiz@epc2i.example', displayName: 'Ana' }))).toEqual({ ok: false, error: 'An account already has this e-mail address' });

    expect(await addRoleAction(null, form({ userId: id, role: 'technician', scopeRef: 'LAB67' }))).toEqual({ ok: true });
    expect(await addRoleAction(null, form({ userId: id, role: 'technician', scopeRef: 'ZZZ' }))).toEqual({ ok: false, error: 'Choose a facility' });
    expect(await addRoleAction(null, form({ userId: id, role: 'partner', scopeRef: 'EPC2I' }))).toEqual({ ok: false, error: 'A partner contact is given a partner entity' });
    const [a] = await t.db.select().from(roleAssignments).where(eq(roleAssignments.userId, id));
    expect(a).toMatchObject({ role: 'technician', scopeKind: 'facility', scopeRef: 'LAB67', createdByName: 'Crucible administrator' });
    expect(await lastAudit()).toMatchObject({ change: 'role added: technician · LAB67' });

    expect(await removeRoleAction(a.id)).toEqual({ ok: true });
    expect(await t.db.$count(roleAssignments, eq(roleAssignments.userId, id))).toBe(0);
    expect(await lastAudit()).toMatchObject({ change: 'role removed: technician · LAB67' });

    expect(await setUserActiveAction(id, false)).toEqual({ ok: true });
    expect((await t.db.select({ a: users.active }).from(users).where(eq(users.id, id)))[0].a).toBe(false);
    expect(await setUserActiveAction(id, true)).toEqual({ ok: true });
    expect(await lastAudit()).toMatchObject({ change: 'account reactivated' });
  });

  it('an administrator cannot deactivate themselves nor remove their own last administrator role', async () => {
    as('admin');
    const me = (await userId('admin.crucible@epc2i.example'))!;
    expect(await setUserActiveAction(me, false)).toEqual({ ok: false, error: 'You cannot deactivate your own account' });
    const [mine] = await t.db.select().from(roleAssignments).where(and(eq(roleAssignments.userId, me), eq(roleAssignments.role, 'admin')));
    expect(await removeRoleAction(mine.id)).toEqual({ ok: false, error: 'You cannot remove your own last administrator role' });
  });

  it('organisation: entity, site, facility shared with a partner', async () => {
    as('admin');
    expect(await createEntityAction(null, form({ code: 'EPCBE', name: 'EPC Belgique', kind: 'partner' }))).toEqual({ ok: true });
    expect(await createSiteAction(null, form({ code: 'SITE-2', name: 'Second test site', city: 'Lyon' }))).toEqual({ ok: true });
    expect(await createSiteAction(null, form({ code: 'SITE-2', name: 'Again' }))).toEqual({ ok: false, error: 'This code is already used' });
    expect(await createFacilityAction(null, form({ code: 'ATM2', name: 'Workshop 2', siteCode: 'SITE-2', operatorEntityCode: 'EPC2I', partnerEntityCodes: ['EPCFR', 'EPCBE'] }))).toEqual({ ok: true });
    expect(await t.db.$count(entities, eq(entities.code, 'EPCBE'))).toBe(1);
    expect((await t.db.select().from(sites).where(eq(sites.code, 'SITE-2')))[0]).toMatchObject({ name: 'Second test site', countryIso2: 'FR' });
    expect((await t.db.select().from(facilities).where(eq(facilities.code, 'ATM2')))[0]).toMatchObject({ siteCode: 'SITE-2', operatorEntityCode: 'EPC2I' });
    expect((await t.db.select().from(facilityPartners).where(eq(facilityPartners.facilityCode, 'ATM2'))).map((x) => x.entityCode).sort()).toEqual(['EPCBE', 'EPCFR']);
    expect(await lastAudit()).toMatchObject({ objectRef: 'Facility ATM2', change: 'facility created' });
  });

  it('projects: the R&D director or the administrator, with the priority class; never a project lead', async () => {
    as('project_lead');
    expect(await createProjectAction(null, form({ code: 'RD-ALTAIR', name: 'Altair', entityCode: 'EPC2I', priorityClass: 'P1' }))).toEqual({ ok: false, error: 'This action is reserved to the R&D director and the administrator' });
    as('rd_director');
    expect(await createProjectAction(null, form({ code: 'rd-altair', name: 'Altair', entityCode: 'EPC2I', priorityClass: 'P1', confidential: 'on' }))).toEqual({ ok: true });
    expect((await t.db.select().from(projects).where(eq(projects.code, 'RD-ALTAIR')))[0]).toMatchObject({ priorityClass: 'P1', confidential: true, entityCode: 'EPC2I' });
    expect(await lastAudit()).toMatchObject({ objectRef: 'Project RD-ALTAIR', area: 'Projects', projectCode: 'RD-ALTAIR', actorRole: 'rd_director' });
  });
});
