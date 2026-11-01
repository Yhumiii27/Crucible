// Limits of a resource and weekly series of requests (CR-078, X-11) on a fresh PostgreSQL database with the demo data set:
// who sets the limits (audited), the limits refused as hard constraints with their reason, a weekly series requested all or
// none, each booking carrying the series reference. Business clock: the (fake) system time, Thu 22 Oct 2026 at 10:00.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { asc, eq } from 'drizzle-orm';
import { REAL_CLOCK } from '@/domain/clock';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { auditEntries, bookings, resources } from '@/server/db/schema';
import { testDatabase, type TestDatabase } from '@/test/db';
import { requestBookingAction, setResourceLimitsAction } from './actions';

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
const res = async (code: string) => (await t.db.select().from(resources).where(eq(resources.code, code)))[0];
const request = async (code: string, day: string, extra: Record<string, string> = {}) =>
  requestBookingAction(null, form({ resourceId: (await res(code)).id, projectCode: 'RD-ORION', fromOn: day, toOn: extra.toOn ?? day, fromHalf: 'am', toHalf: 'am', title: extra.title ?? 'Workshop run', ...extra }));

describe('limits of a resource', () => {
  it('set by the facility manager only, checked and audited', async () => {
    const atm = await res('PDE-ATM');
    as('project_lead');
    expect(await setResourceLimitsAction(null, form({ resourceId: atm.id, bufferMinutes: '30' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('facility_manager');
    expect(await setResourceLimitsAction(null, form({ resourceId: atm.id, bufferMinutes: '-5' }))).toEqual({ ok: false, error: 'Free time between bookings: 0 to 1,440 minutes' });
    expect(await setResourceLimitsAction(null, form({ resourceId: atm.id, bufferMinutes: '0', minNoticeHours: '720', maxDays: '2' }))).toEqual({ ok: true });
    expect(await res('PDE-ATM')).toMatchObject({ bufferMinutes: 0, minNoticeHours: 720, maxDays: 2 });
    const [a] = await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'Resource PDE-ATM'));
    expect(a.change).toBe('limits: 0 min · 720 h · 2 d');
  });

  it('a request with less notice, or longer than allowed, is refused citing the limit', async () => {
    as('project_lead');
    expect(await request('PDE-ATM', '2026-11-02')).toEqual({ ok: false, error: 'Less notice than the resource asks for a new request · 720 h' });
    expect(await request('PDE-ATM', '2026-11-30', { toOn: '2026-12-02' })).toEqual({ ok: false, error: 'Longer than the resource allows for one booking · 2 d' });
  });
});

describe('weekly series', () => {
  it('every week checked: one week refused refuses the series, naming its date', async () => {
    as('project_lead');
    // 30 days of notice: 23 Nov is too close; asking from 16 Nov, the first week is the one refused.
    const r = await request('PDE-ATM', '2026-11-16', { repeatWeeks: '2' });
    expect(r).toEqual({ ok: false, error: '2026-11-16 · Less notice than the resource asks for a new request · 720 h' });
    expect((await t.db.select().from(bookings).where(eq(bookings.title, 'Workshop run'))).length).toBe(0);
  });

  it('all free: one request per week, each with the series reference', async () => {
    as('project_lead');
    const r = await request('PDE-ATM', '2026-11-30', { repeatWeeks: '2', title: 'Weekly workshop run' });
    expect(r.ok).toBe(true);
    const rows = await t.db.select().from(bookings).where(eq(bookings.title, 'Weekly workshop run')).orderBy(asc(bookings.startsAt));
    expect(rows.map((b) => b.startsAt.toISOString())).toEqual([parisInstant('2026-11-30', '07:00'), parisInstant('2026-12-07', '07:00'), parisInstant('2026-12-14', '07:00')].map((d) => d.toISOString()));
    expect(rows.every((b) => b.status === 'requested' && b.seriesRef === rows[0].ref)).toBe(true);
    expect(r.ok && r.warnings?.[0]).toBe(`3 bookings requested · series ${rows[0].ref}`);
    expect(await request('PDE-ATM', '2026-11-30', { repeatWeeks: '26' })).toEqual({ ok: false, error: 'Repeat: 0 to 25 more weeks' });
  });

  it('free time between bookings: the next half-day after a confirmed booking is refused', async () => {
    as('facility_manager');
    const atm = await res('PDE-ATM');
    expect(await setResourceLimitsAction(null, form({ resourceId: atm.id, bufferMinutes: '60' }))).toEqual({ ok: true });
    const [first] = await t.db.select().from(bookings).where(eq(bookings.title, 'Weekly workshop run')).orderBy(asc(bookings.startsAt)).limit(1);
    await t.db.update(bookings).set({ status: 'confirmed' }).where(eq(bookings.id, first.id));
    as('project_lead');
    const pm = await requestBookingAction(null, form({ resourceId: atm.id, projectCode: 'RD-ORION', fromOn: '2026-11-30', toOn: '2026-11-30', fromHalf: 'pm', toHalf: 'pm', title: 'Right after' }));
    expect(pm).toEqual({ ok: false, error: `Too close to another booking of the resource: free time is kept between two bookings · 60 min · ${first.ref}` });
  });
});
