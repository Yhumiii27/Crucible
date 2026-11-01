// Maintenance and calibration plans (CR-073, X-12) on a fresh PostgreSQL database with the demo data set, demo mode ("View
// as"): who keeps them, the hard constraint of a blocking plan past due (and none from an alert-only plan), an intervention
// recorded append-only that moves the due date, the daily notice to the facility's managers once per due date, a plan
// withdrawn. Business clock: the (fake) system time, Thu 22 Oct 2026 at 10:00.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { eq, sql } from 'drizzle-orm';
import { REAL_CLOCK } from '@/domain/clock';
import { requestBookingAction } from '@/features/resources/actions';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { auditEntries, maintenancePlans, maintenanceRecords, notifications, resources } from '@/server/db/schema';
import { remindMaintenance } from '@/server/notify/jobs';
import { testDatabase, type TestDatabase } from '@/test/db';
import { createMaintenancePlanAction, recordMaintenanceAction, withdrawMaintenancePlanAction } from './actions';

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
const atm = async () => (await t.db.select().from(resources).where(eq(resources.code, 'PDE-ATM')))[0].id;
const plan = async (label: string) => (await t.db.select().from(maintenancePlans).where(eq(maintenancePlans.label, label)))[0];
const requestAtm = async (day: string) => {
  as('project_lead');
  return requestBookingAction(null, form({ resourceId: await atm(), projectCode: 'RD-ORION', fromOn: day, toOn: day, fromHalf: 'am', toHalf: 'am', title: 'Workshop run' }));
};

describe('maintenance and calibration plans', () => {
  it('kept by the facility manager only; a blocking plan past due refuses the slots ending after it', async () => {
    as('project_lead');
    const fields = { resourceId: await atm(), kind: 'preventive', label: 'Lathe servicing', periodMonths: '12', lastOn: '2025-11-03', provider: 'Atelier Martin', blocking: 'on' };
    expect(await createMaintenancePlanAction(null, form(fields))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('facility_manager');
    expect(await createMaintenancePlanAction(null, form(fields))).toEqual({ ok: true });
    expect(await createMaintenancePlanAction(null, form(fields))).toEqual({ ok: false, error: 'This resource already has a plan with this name' });
    expect(await plan('Lathe servicing')).toMatchObject({ kind: 'preventive', periodMonths: 12, lastOn: '2025-11-03', blocking: true, active: true });
    // Due 3 Nov 2026: 2 Nov passes, 4 Nov is refused.
    expect((await requestAtm('2026-11-02')).ok).toBe(true);
    expect(await requestAtm('2026-11-04')).toEqual({ ok: false, error: 'A maintenance or calibration falls due before the end of the slot · Lathe servicing · 2026-11-03' });
  });

  it('an intervention is recorded as is (append-only) and moves the due date; an earlier one does not', async () => {
    const p = await plan('Lathe servicing');
    as('facility_manager');
    expect(await recordMaintenanceAction(null, form({ planId: p.id, doneOn: '2026-10-20', codexRef: 'CER-0042' }))).toEqual({ ok: true });
    expect((await plan('Lathe servicing')).lastOn).toBe('2026-10-20');
    expect(await recordMaintenanceAction(null, form({ planId: p.id, doneOn: '2026-09-01' }))).toEqual({ ok: true });
    expect((await plan('Lathe servicing')).lastOn).toBe('2026-10-20');
    const recs = await t.db.select().from(maintenanceRecords).where(eq(maintenanceRecords.planId, p.id));
    expect(recs).toHaveLength(2);
    expect(recs.find((r) => r.doneOn === '2026-10-20')).toMatchObject({ provider: 'Atelier Martin', codexRef: 'CER-0042', recordedByName: expect.any(String) });
    await expect(t.db.execute(sql`delete from crucible.maintenance_records`)).rejects.toThrow();
    expect((await requestAtm('2026-11-04')).ok).toBe(true);
    expect((await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'Resource PDE-ATM'))).map((a) => a.change)).toContain('intervention recorded: Lathe servicing · 2026-10-20');
  });

  it('an alert-only plan never refuses; the managers are told once per due date', async () => {
    as('facility_manager');
    expect(await createMaintenancePlanAction(null, form({ resourceId: await atm(), kind: 'calibration', label: 'Torque wrench', periodMonths: '6', lastOn: '2026-04-30' }))).toEqual({ ok: true });
    expect((await requestAtm('2026-11-09')).ok).toBe(true);
    expect(await remindMaintenance(t.db, '2026-10-22')).toBeGreaterThan(0);
    const sent = await t.db.select().from(notifications).where(eq(notifications.kind, 'maintenance_due'));
    expect(new Set(sent.map((n) => n.title))).toEqual(new Set(['Maintenance or calibration due · PDE-ATM · Torque wrench · 2026-10-30']));
    expect(sent[0].href).toBe('/facilities/PDE?tab=maintenance');
    expect(await remindMaintenance(t.db, '2026-10-23')).toBe(0);
  });

  it('a withdrawn plan no longer blocks nor alerts; its interventions stay', async () => {
    const p = await plan('Lathe servicing');
    as('project_lead');
    expect(await withdrawMaintenancePlanAction(p.id)).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('facility_manager');
    expect(await withdrawMaintenancePlanAction(p.id)).toEqual({ ok: true });
    expect((await plan('Lathe servicing')).active).toBe(false);
    expect(await recordMaintenanceAction(null, form({ planId: p.id, doneOn: '2026-10-21' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    expect(await t.db.select().from(maintenanceRecords).where(eq(maintenanceRecords.planId, p.id))).toHaveLength(2);
  });
});
