// Server Functions and reads of delivery 3 on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): who
// enters milestones and needs (F-13), what is refused, what is audited, the late requests (F-5), the load forecast of the demo
// (a PDE bottleneck 8 weeks ahead) and the pub_ views (S-5, S-7). The business clock follows the (fake) system time, set per
// test from the demo date, Thu 22 Oct 2026 at 10:00.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { and, desc, eq } from 'drizzle-orm';
import { REAL_CLOCK } from '@/domain/clock';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { connectorStates } from '@/server/dal/connectors';
import { loadScreen, myNeeds, projectSheet } from '@/server/dal/needs';
import { auditEntries, bookings, projectMilestones, resources, testNeeds, testTypes } from '@/server/db/schema';
import { getViewer } from '@/server/session';
import { testDatabase, type TestDatabase } from '@/test/db';
import { requestBookingAction } from '../resources/actions';
import {
  addMilestoneAction, createNeedAction, createTestTypeAction, removeMilestoneAction, setReportRefAction, setTestTypeActiveAction, updateMilestoneAction, updateNeedAction,
  withdrawNeedAction,
} from './actions';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase();
  setClockForTests(REAL_CLOCK);
});
afterAll(async () => {
  setClockForTests(null);
  await t.close();
});
beforeEach(() => {
  jar.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(parisInstant('2026-10-22', '10:00'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const rid = async (code: string) => (await t.db.select({ id: resources.id }).from(resources).where(eq(resources.code, code)))[0].id;
const need = async (ref: string) => (await t.db.select().from(testNeeds).where(eq(testNeeds.ref, ref)))[0];
const lastAudit = async (objectRef: string) => (await t.db.select().from(auditEntries).where(and(eq(auditEntries.objectRef, objectRef))).orderBy(desc(auditEntries.occurredAt)).limit(1))[0];
const milestone = async (projectCode: string, label: string) =>
  (await t.db.select().from(projectMilestones).where(and(eq(projectMilestones.projectCode, projectCode), eq(projectMilestones.label, label))))[0];

describe('milestones', () => {
  it('a project lead adds, changes and removes a milestone of their project; each change is audited', async () => {
    as('project_lead');
    expect(await addMilestoneAction(null, form({ projectCode: 'RD-ORION', label: 'Customer demo', dueOn: '2027-02-10', criticality: 'contractual' }))).toEqual({ ok: true });
    const m = await milestone('RD-ORION', 'Customer demo');
    expect(m).toMatchObject({ dueOn: '2027-02-10', criticality: 'contractual', source: 'crucible', updatedByName: 'Camille Fabre' });
    vi.setSystemTime(parisInstant('2026-10-22', '10:01'));
    expect(await updateMilestoneAction(null, form({ milestoneId: m.id, label: 'Customer demo', dueOn: '2027-02-17', criticality: 'contractual' }))).toEqual({ ok: true });
    expect((await lastAudit('Project RD-ORION')).change).toBe('milestone changed: Customer demo · 2027-02-10 → Customer demo · 2027-02-17');
    vi.setSystemTime(parisInstant('2026-10-22', '10:02'));
    expect(await removeMilestoneAction(m.id)).toEqual({ ok: true });
    expect(await milestone('RD-ORION', 'Customer demo')).toBeUndefined();
    expect((await lastAudit('Project RD-ORION')).change).toBe('milestone removed: Customer demo · 2027-02-17');
  });

  it('refuses another project, a partner on an EPC2i project, and the removal of a milestone that needs serve', async () => {
    as('project_lead');
    expect(await addMilestoneAction(null, form({ projectCode: 'RD-VEGA', label: 'Review', dueOn: '2027-02-10' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('partner');
    expect(await addMilestoneAction(null, form({ projectCode: 'RD-ORION', label: 'Review', dueOn: '2027-02-10' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    expect(await addMilestoneAction(null, form({ projectCode: 'FR-LYRA', label: 'Interim report', dueOn: '2027-01-29' }))).toEqual({ ok: true });
    as('coordinator');
    expect(await addMilestoneAction(null, form({ projectCode: 'RD-CASSIOPEE', label: 'Review', dueOn: '2027-02-10' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('project_lead');
    const m = await milestone('RD-ORION', 'Qualification review');
    expect(await removeMilestoneAction(m.id)).toEqual({ ok: false, error: 'Needs serve this milestone · N-2026-0001' });
    expect(await removeMilestoneAction('not-a-uuid')).toEqual({ ok: false, error: 'This action is not in your workspace' });
  });
});

describe('test needs', () => {
  it('a project lead records a forecast due on its milestone; the reference follows the year; it is audited', async () => {
    as('project_lead');
    const m = await milestone('RD-ORION', 'Qualification review');
    const r = await createNeedAction(null, form({
      projectCode: 'RD-ORION', level: 'forecast', title: 'Second firing campaign', resourceId: await rid('PDE-PIL'), halfDays: '6', milestoneId: m.id, earliestOn: '2027-01-04', testTypeCode: 'FIRING',
    }));
    expect(r).toEqual({ ok: true, warnings: [] });
    const n = await need('N-2026-0007');
    expect(n).toMatchObject({ projectCode: 'RD-ORION', level: 'forecast', deadlineOn: '2027-01-15', halfDays: 6, status: 'open', requestedByName: 'Camille Fabre' });
    expect((await lastAudit('Need N-2026-0007')).change).toBe('forecast recorded: 6 half-days · 2027-01-04 → 2027-01-15');
  });

  it('a request with less than 10 working days of notice is accepted and flagged late (F-5)', async () => {
    // The coordinator enters needs for every project they see (F-13).
    as('coordinator');
    const r = await createNeedAction(null, form({ projectCode: 'RD-VEGA', level: 'request', title: 'Casing tensile tests', resourceId: await rid('LAB67-TRAC'), halfDays: '1', earliestOn: '2026-10-28', deadlineOn: '2026-11-06' }));
    expect(r).toEqual({ ok: true, warnings: ['Late request: less notice than agreed'] });
  });

  it('refuses a resource the partner does not see, a deadline already passed, a milestone of another project', async () => {
    as('partner');
    const base = { projectCode: 'FR-LYRA', level: 'forecast', title: 'Ageing cycles', halfDays: '4', earliestOn: '2026-11-16', deadlineOn: '2026-12-18' };
    expect(await createNeedAction(null, form({ ...base, resourceId: await rid('PDE-PIL') }))).toEqual({ ok: false, error: 'Choose one of the resources' });
    expect(await createNeedAction(null, form({ ...base, resourceId: await rid('LAB67-CLIM'), earliestOn: '2026-10-01', deadlineOn: '2026-10-20' }))).toEqual({ ok: false, error: 'The deadline has passed' });
    const other = await milestone('RD-ORION', 'Design freeze');
    expect(await createNeedAction(null, form({ ...base, resourceId: await rid('LAB67-CLIM'), milestoneId: other.id }))).toEqual({ ok: false, error: 'Choose a milestone of the project' });
    expect(await createNeedAction(null, form({ ...base, resourceId: await rid('LAB67-CLIM') }))).toMatchObject({ ok: true });
  });

  it('a forecast becomes a request; a withdrawn need cannot be changed', async () => {
    as('project_lead');
    const n = await need('N-2026-0007');
    const fields = { needId: n.id, level: 'request', title: n.title, resourceId: n.resourceId, halfDays: '6', earliestOn: n.earliestOn, deadlineOn: n.deadlineOn, milestoneId: n.milestoneId ?? '', testTypeCode: 'FIRING' };
    vi.setSystemTime(parisInstant('2026-10-22', '11:00'));
    expect(await updateNeedAction(null, form(fields))).toEqual({ ok: true, warnings: [] });
    expect((await need('N-2026-0007')).level).toBe('request');
    expect((await lastAudit('Need N-2026-0007')).change).toBe('level: forecast → request');
    vi.setSystemTime(parisInstant('2026-10-22', '11:01'));
    expect(await withdrawNeedAction(null, form({ needId: n.id, reason: 'Trials moved to the supplier' }))).toEqual({ ok: true });
    expect(await need('N-2026-0007')).toMatchObject({ status: 'withdrawn', withdrawnReason: 'Trials moved to the supplier' });
    expect(await updateNeedAction(null, form(fields))).toEqual({ ok: false, error: 'This need has been withdrawn' });
  });

  it('a booking serves an open need of its project, never another project’s', async () => {
    as('project_lead');
    const orion = await need('N-2026-0001');
    const vega = await need('N-2026-0002');
    const slot = { resourceId: await rid('PDE-PIL'), projectCode: 'RD-ORION', fromOn: '2026-11-09', toOn: '2026-11-09', fromHalf: 'am', toHalf: 'pm', title: 'Firing campaign, day 1' };
    expect(await requestBookingAction(null, form({ ...slot, needId: vega.id }))).toEqual({ ok: false, error: 'Choose an open need of the project' });
    expect(await requestBookingAction(null, form({ ...slot, needId: orion.id }))).toEqual({ ok: true, warnings: [] });
    const [b] = await t.db.select().from(bookings).where(eq(bookings.title, 'Firing campaign, day 1'));
    expect(b.needId).toBe(orion.id);
    const sheet = await projectSheet(await getViewer(), 'RD-ORION', '2026-10-22');
    expect(sheet!.needs.find((x) => x.ref === 'N-2026-0001')!.spread).toMatchObject({ askedHours: 60, coveredHours: 10, remainingHours: 50 });
  });
});

describe('reads', () => {
  it('the load forecast signals the PDE bottleneck of the week of 14 Dec, 8 weeks ahead (done-when of delivery 3)', async () => {
    as('coordinator');
    const data = await loadScreen(await getViewer(), '2026-10-22');
    const b = data.signals.filter((s) => s.kind === 'bottleneck');
    expect(b.map((x) => `${x.subject} ${x.monday} ${x.weeksAhead}`)).toContain('PDE-ONE-ZONE 2026-12-14 8');
    // The pilot's electrical inspection falls due on 16 Nov (R-10): the December firing campaign cannot be booked until it is renewed.
    expect(data.inspectionAlerts).toContainEqual({ needRef: 'N-2026-0001', resourceCode: 'PDE-PIL', label: 'Periodic check of the electrical installations', dueOn: '2026-11-16' });
    // Cassiopée is confidential: the coordinator sees its need, not its project nor its purpose (U-3).
    expect(data.needs.find((n) => n.ref === 'N-2026-0003')).toMatchObject({ projectCode: null, title: null, confidential: true, entityCode: 'EPC2I' });
  });

  it('a project sheet does not exist outside the viewer’s visibility; my needs list the projects I enter', async () => {
    as('partner');
    expect(await projectSheet(await getViewer(), 'RD-ORION', '2026-10-22')).toBeNull();
    expect((await myNeeds(await getViewer(), '2026-10-22')).projects.map((p) => p.code)).toEqual(['FR-LYRA']);
    as('project_lead');
    const mine = await myNeeds(await getViewer(), '2026-10-22');
    expect(mine.projects.map((p) => p.code)).toEqual(['RD-CASSIOPEE', 'RD-ORION']);
    as('technician');
    expect(await projectSheet(await getViewer(), 'RD-ORION', '2026-10-22')).toBeNull();
  });

  it('the late request of the demo is flagged on its project sheet', async () => {
    as('rd_director');
    const sheet = await projectSheet(await getViewer(), 'RD-VEGA', '2026-10-22');
    expect(sheet!.needs.find((n) => n.ref === 'N-2026-0006')).toMatchObject({ late: true, level: 'request' });
    expect(sheet!.needs.find((n) => n.ref === 'N-2026-0002')).toMatchObject({ late: false });
  });
});

describe('test types and reports', () => {
  it('the coordinator keeps the catalogue; a project lead may not', async () => {
    as('project_lead');
    expect(await createTestTypeAction(null, form({ code: 'DETON', name: 'Detonation velocity' }))).toMatchObject({ ok: false });
    as('coordinator');
    expect(await createTestTypeAction(null, form({ code: 'deton', name: 'Detonation velocity', nominalResourceId: await rid('PDE-PIL'), typicalHalfDays: '1' }))).toEqual({ ok: true });
    expect(await setTestTypeActiveAction('DETON', false)).toEqual({ ok: true });
    expect((await t.db.select().from(testTypes).where(eq(testTypes.code, 'DETON')))[0]).toMatchObject({ active: false, typicalHalfDays: 1 });
  });

  it('the technician of the PDE records the Codex reference of a done test’s report (P-4, S-6)', async () => {
    const [done] = await t.db.select().from(bookings).where(eq(bookings.ref, 'B-2026-0001'));
    const [planned] = await t.db.select().from(bookings).where(eq(bookings.ref, 'B-2026-0011'));
    as('technician');
    expect(await setReportRefAction(null, form({ bookingId: done.id, codexRef: 'RPT-ORION-0042' }))).toEqual({ ok: true });
    expect((await t.db.select().from(bookings).where(eq(bookings.id, done.id)))[0].codexRef).toBe('RPT-ORION-0042');
    expect(await setReportRefAction(null, form({ bookingId: planned.id, codexRef: 'RPT-ORION-0043' }))).toEqual({ ok: false, error: 'Only a done test has a report' });
    as('partner');
    expect(await setReportRefAction(null, form({ bookingId: done.id, codexRef: 'X-1' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
  });
});

describe('pub_ views (S-5, S-7)', () => {
  it('pub_moyens and pub_reservations have their contract columns; a confidential project is masked', async () => {
    const cols = async (view: string) => (await t.handle.pool.query(
      `select column_name from information_schema.columns where table_schema = 'crucible' and table_name = $1 order by ordinal_position`, [view],
    )).rows.map((r) => r.column_name);
    expect(await cols('pub_moyens')).toEqual(['code', 'nom', 'nature', 'installation_code', 'installation', 'site_code', 'entite_exploitante', 'capacite', 'granularite', 'etat', 'maj_le']);
    expect(await cols('pub_reservations')).toEqual(['ref', 'moyen_code', 'installation_code', 'site_code', 'entite_code', 'projet_code', 'projet_keystone', 'objet', 'confidentiel', 'statut', 'debut', 'fin', 'debut_reel', 'fin_reel', 'maj_le']);
    const rows = (await t.handle.pool.query(`select ref, projet_code, objet, confidentiel, statut from crucible.pub_reservations order by ref`)).rows;
    expect(rows.find((r) => r.ref === 'B-2026-0010')).toEqual({ ref: 'B-2026-0010', projet_code: null, objet: null, confidentiel: true, statut: 'confirmed' });
    expect(rows.find((r) => r.ref === 'B-2026-0011')).toMatchObject({ projet_code: 'RD-ORION', objet: 'Firing tests, series 2' });
    expect(rows.some((r) => r.statut === 'requested' || r.statut === 'no_show')).toBe(false);
  });

  it('the connectors screen sees its own views, and the other tools’ as not published on this server', async () => {
    const states = await connectorStates();
    expect(states.get('crucible.pub_reservations')).toBe('readable');
    expect(states.get('keystone.pub_jalons')).toBe('absent');
  });
});
