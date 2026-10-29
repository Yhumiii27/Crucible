// Measured occupancy (CR-071, X-8) on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): a facility
// manager adds a device to a resource of their facility (token shown once, audited); the device's events, sent to
// POST /api/occupancy or by the kiosk's buttons, start and end the booking of the resource, or are kept as a use without a
// booking; a revoked token opens nothing; the events are append-only; the kiosk never names a confidential project.
// Business clock: the (fake) system time, Thu 22 Oct 2026; B-2026-0010 is PDE-LAB 12:00–17:00 (30 min of preparation).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { desc, eq, sql } from 'drizzle-orm';
import { POST } from '@/app/api/occupancy/route';
import { REAL_CLOCK } from '@/domain/clock';
import { createDeviceAction, kioskEventAction, revokeDeviceAction } from '@/features/measure/actions';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { auditEntries, bookings, occupancyDevices, occupancyEvents, resources } from '@/server/db/schema';
import { deviceOfToken, facilityMeasurement, kioskView } from '@/server/occupancy';
import { getViewer } from '@/server/session';
import { testDatabase, type TestDatabase } from '@/test/db';

let t: TestDatabase;
let lab = '';
let token = '';
beforeAll(async () => {
  t = await testDatabase();
  setClockForTests(REAL_CLOCK);
  lab = (await t.db.select({ id: resources.id }).from(resources).where(eq(resources.code, 'PDE-LAB')))[0].id;
});
afterAll(async () => {
  setClockForTests(null);
  await t.close();
});
beforeEach(() => {
  jar.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(parisInstant('2026-10-22', '11:30'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const post = (body: unknown, auth: string | null = `Bearer ${token}`) =>
  POST(new Request('http://localhost/api/occupancy', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const booking = async (ref: string) => (await t.db.select().from(bookings).where(eq(bookings.ref, ref)))[0];

describe('devices', () => {
  it('the facility manager adds one to a resource of their facility; the token is shown once and kept as a hash; audited', async () => {
    as('technician');
    expect(await createDeviceAction(null, form({ facilityCode: 'PDE', resourceId: lab, kind: 'kiosk', label: 'Borne labo' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('facility_manager');
    expect(await createDeviceAction(null, form({ facilityCode: 'LAB67', resourceId: lab, kind: 'kiosk', label: 'Borne labo' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    expect(await createDeviceAction(null, form({ facilityCode: 'PDE', resourceId: lab, kind: 'drone', label: 'Borne labo' }))).toEqual({ ok: false, error: 'Choose the kind of device' });
    const r = await createDeviceAction(null, form({ facilityCode: 'PDE', resourceId: lab, kind: 'kiosk', label: 'Borne labo' }));
    expect(r).toMatchObject({ ok: true, secret: expect.stringMatching(/^crd_[A-Za-z0-9_-]{43}$/) });
    token = r.ok ? r.secret : '';
    expect(r.ok && r.path).toBe(`/kiosk/${token}`);
    const [d] = await t.db.select().from(occupancyDevices);
    expect(d.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(d)).not.toContain(token);
    expect(await deviceOfToken(token)).toMatchObject({ resourceCode: 'PDE-LAB', facilityCode: 'PDE', kind: 'kiosk', label: 'Borne labo' });
    const [a] = await t.db.select().from(auditEntries).where(eq(auditEntries.entityId, d.id));
    expect(a).toMatchObject({ area: 'Facilities', objectRef: 'Resource PDE-LAB', change: 'occupancy device added: Kiosk · Borne labo', actorRole: 'facility_manager' });
    // The kiosk is seen by anyone in front of the resource: B-2026-0010 (a confidential project) shows its reference only.
    const view = await kioskView((await deviceOfToken(token))!, new Date());
    expect(view.next).toEqual([expect.objectContaining({ ref: 'B-2026-0010', label: null })]);
  });
});

describe('POST /api/occupancy', () => {
  it('refuses a missing or unknown token and a malformed body', async () => {
    expect((await post({ event: 'start' }, null)).status).toBe(401);
    expect((await post({ event: 'start' }, `Bearer crd_${'x'.repeat(43)}`)).status).toBe(401);
    expect((await post('not json')).status).toBe(400);
    expect(await (await post({ event: 'pause' })).json()).toEqual({ error: 'kind must be "start" or "stop"' });
    expect(await (await post({ event: 'start', at: '2026-10-22T09:00:00' })).json()).toEqual({ error: 'at must be an ISO 8601 instant with its zone' });
  });

  it('a start in the preparation window starts the booking at that instant, audited in the device name; a second start is ignored', async () => {
    const res = await post({ event: 'start' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'started', booking: 'B-2026-0010', reason: null, at: parisInstant('2026-10-22', '11:30').toISOString() });
    const b = await booking('B-2026-0010');
    expect(b).toMatchObject({ status: 'in_progress', actualStartAt: parisInstant('2026-10-22', '11:30') });
    const [a] = await t.db.select().from(auditEntries).where(eq(auditEntries.entityId, b.id)).orderBy(desc(auditEntries.occurredAt)).limit(1);
    expect(a).toMatchObject({ actorName: 'Borne labo (kiosk)', actorUserId: null, change: 'status: confirmed → in_progress (measured)' });
    expect(await (await post({ event: 'start' })).json()).toMatchObject({ outcome: 'ignored', reason: 'A test is already running on this resource' });
  });

  it('a stop, dated by the device, ends the running test with its actual end', async () => {
    vi.setSystemTime(parisInstant('2026-10-22', '16:10'));
    expect(await (await post({ event: 'stop', at: parisInstant('2026-10-22', '16:05').toISOString() })).json()).toMatchObject({ outcome: 'ended', booking: 'B-2026-0010' });
    expect(await booking('B-2026-0010')).toMatchObject({ status: 'done', actualStartAt: parisInstant('2026-10-22', '11:30'), actualEndAt: parisInstant('2026-10-22', '16:05') });
  });

  it('outside any booking: a use without a booking, shown on the facility sheet; a stop with nothing running is ignored', async () => {
    vi.setSystemTime(parisInstant('2026-10-22', '19:00'));
    expect(await (await post({ event: 'start' })).json()).toMatchObject({ outcome: 'unbooked_start', booking: null });
    vi.setSystemTime(parisInstant('2026-10-22', '20:00'));
    expect(await (await post({ event: 'stop' })).json()).toMatchObject({ outcome: 'unbooked_stop' });
    expect(await (await post({ event: 'stop' })).json()).toMatchObject({ outcome: 'ignored', reason: 'Nothing is running on this resource' });
    as('technician');
    const m = await facilityMeasurement(await getViewer(), 'PDE', new Date());
    expect(m.devices).toMatchObject([{ resourceCode: 'PDE-LAB', kind: 'kiosk', label: 'Borne labo', revoked: false }]);
    expect(m.unbooked).toEqual([{ resourceCode: 'PDE-LAB', from: parisInstant('2026-10-22', '19:00').getTime(), to: parisInstant('2026-10-22', '20:00').getTime(), deviceLabel: 'Borne labo' }]);
    // B-2026-0010 is a confidential project's booking: the technician sees its reference, never its project (U-3).
    expect(m.events.find((e) => e.outcome === 'started')).toMatchObject({ bookingRef: 'B-2026-0010', project: null });
  });

  it('the events are append-only', async () => {
    await expect(t.db.execute(sql`update crucible.occupancy_events set outcome = 'ignored'`)).rejects.toThrow();
    await expect(t.db.execute(sql`delete from crucible.occupancy_events`)).rejects.toThrow();
    expect((await t.db.select().from(occupancyEvents)).length).toBe(6);
  });
});

describe('the kiosk', () => {
  it('names no confidential project; its buttons record events; a revoked device opens nothing', async () => {
    vi.setSystemTime(parisInstant('2026-10-27', '06:00'));
    const device = (await deviceOfToken(token))!;
    const v = await kioskView(device, new Date());
    expect(v.running).toBeNull();
    expect(await kioskEventAction(token, 'stop')).toEqual({ ok: false, error: 'Nothing is running on this resource' });
    expect(await kioskEventAction(token, 'start')).toEqual({ ok: true });
    expect(await kioskEventAction('crd_nope', 'start')).toEqual({ ok: false, error: 'Unknown or revoked device' });
    as('facility_manager');
    const [d] = await t.db.select().from(occupancyDevices);
    expect(await revokeDeviceAction(d.id)).toEqual({ ok: true });
    expect(await deviceOfToken(token)).toBeNull();
    expect(await kioskEventAction(token, 'stop')).toEqual({ ok: false, error: 'Unknown or revoked device' });
    expect((await post({ event: 'stop' })).status).toBe(401);
  });
});
