// Forms of the bookings (CR-075, X-14) on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): the PDE's
// manager keeps the templates (versions, audited); the safety checklist gates the start of a test; a technician fills each form
// at its stage, once (incident reports as often as needed, the managers told); a filled form is kept as filled.
// Business clock: the (fake) system time, Thu 22 Oct 2026 at 13:30 (the PDE laboratory rooms are booked that afternoon).
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
import { startBookingAction } from '@/features/resources/actions';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { auditEntries, bookings, formResponses, formTemplates, notifications } from '@/server/db/schema';
import { testDatabase, type TestDatabase } from '@/test/db';
import { fillFormAction, saveFormTemplateAction } from './actions';

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
  vi.setSystemTime(parisInstant('2026-10-22', '13:30'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const booking = async () => (await t.db.select().from(bookings).where(eq(bookings.title, 'Stability measurements')))[0];
const save = (stage: string, items: string, active = true) => saveFormTemplateAction(null, form({ facilityCode: 'PDE', stage, items, ...(active ? { active: 'on' } : {}) }));

describe('templates', () => {
  it('kept by the facility manager only; a change raises the version and is audited', async () => {
    as('technician');
    expect(await save('before', 'Area marked out')).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('facility_manager');
    expect(await save('before', '')).toEqual({ ok: false, error: 'Type at least one item, one per line' });
    expect(await save('before', 'Area marked out')).toEqual({ ok: true });
    expect(await save('before', 'Area marked out\n= Pressure read (bar)')).toEqual({ ok: true });
    expect(await save('incident', '= What happened')).toEqual({ ok: true });
    expect(await save('after', '= Result of the test')).toEqual({ ok: true });
    const [before] = await t.db.select().from(formTemplates).where(eq(formTemplates.stage, 'before'));
    expect(before).toMatchObject({ facilityCode: 'PDE', version: 2, active: true });
    expect(before.items).toHaveLength(2);
    expect((await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'Facility PDE'))).map((a) => a.change)).toContain('Safety checklist: version 2 · 2 items');
  });
});

describe('filling the forms of a booking', () => {
  it('the start waits for the safety checklist; the test sheet waits for the start', async () => {
    const b = await booking();
    as('technician');
    expect(await startBookingAction(b.id)).toEqual({ ok: false, error: 'Fill the safety checklist before starting the test' });
    expect(await fillFormAction(null, form({ bookingId: b.id, stage: 'after', i1: 'done' }))).toEqual({ ok: false, error: 'This form cannot be filled at this stage of the test' });
    expect(await fillFormAction(null, form({ bookingId: b.id, stage: 'before', i2: '4.2' }))).toEqual({ ok: false, error: 'Tick every item · Area marked out' });
    expect(await fillFormAction(null, form({ bookingId: b.id, stage: 'before', i1: 'on', i2: '4.2' }))).toEqual({ ok: true });
    expect(await fillFormAction(null, form({ bookingId: b.id, stage: 'before', i1: 'on', i2: '4.2' }))).toEqual({ ok: false, error: 'This form is already filled for the booking' });
    expect(await startBookingAction(b.id)).toEqual({ ok: true });
    const [r] = await t.db.select().from(formResponses).where(eq(formResponses.stage, 'before'));
    expect(r).toMatchObject({ bookingId: b.id, version: 2, answers: { i1: true, i2: '4.2' }, filledByName: 'Julien Masson' });
  });

  it('incident reports while it runs, the managers told; the test sheet once; nobody outside the facility', async () => {
    const b = await booking();
    as('lab67_manager');
    expect(await fillFormAction(null, form({ bookingId: b.id, stage: 'incident', i1: 'x' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('technician');
    expect(await fillFormAction(null, form({ bookingId: b.id, stage: 'incident', i1: 'Smoke detector went off' }))).toEqual({ ok: true });
    expect(await fillFormAction(null, form({ bookingId: b.id, stage: 'incident', i1: 'Second alarm' }))).toEqual({ ok: true });
    const told = await t.db.select().from(notifications).where(eq(notifications.kind, 'form_incident'));
    expect(told.length).toBeGreaterThan(0);
    expect(told[0]).toMatchObject({ title: `Incident reported on a test · ${b.ref} · PDE-LAB`, href: '/facilities/PDE?tab=forms' });
    expect(await fillFormAction(null, form({ bookingId: b.id, stage: 'after', i1: 'Stable' }))).toEqual({ ok: true });
    expect(await fillFormAction(null, form({ bookingId: b.id, stage: 'after', i1: 'Stable' }))).toEqual({ ok: false, error: 'This form is already filled for the booking' });
    await expect(t.db.execute(sql`update crucible.form_responses set answers = '{}'::jsonb`)).rejects.toThrow();
  });

  it('a form switched off is no longer asked: the start no longer waits for it', async () => {
    as('facility_manager');
    expect(await save('before', 'Area marked out', false)).toEqual({ ok: true });
    const [next] = await t.db.select().from(bookings).where(eq(bookings.title, 'Firing tests, series 2'));
    as('technician');
    expect(await fillFormAction(null, form({ bookingId: next.id, stage: 'before', i1: 'on' }))).toEqual({ ok: false, error: 'The facility asks no such form' });
  });
});
