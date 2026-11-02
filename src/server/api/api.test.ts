// REST API and webhooks of the bench systems (CR-083, X-17) on a fresh PostgreSQL database with the demo data set, demo mode
// ("View as"): a facility manager declares a client of their facility (token and signing secret shown once, kept as a hash and
// stored respectively; audited); the triggers write an event for every booking created, confirmed, cancelled or moved, and for
// an incident on a resource, never for the imported history; the events are append-only; the client reads its facility only,
// a confidential project masked; the webhook receives each event signed, in order, and waits longer after each failure.
// Business clock: the (fake) system time, Thu 22 Oct 2026.
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { and, asc, eq, sql } from 'drizzle-orm';
import { GET as getBookings } from '@/app/api/v1/bookings/route';
import { GET as getBooking } from '@/app/api/v1/bookings/[ref]/route';
import { GET as getEvents } from '@/app/api/v1/events/route';
import { GET as getResources } from '@/app/api/v1/resources/route';
import { REAL_CLOCK } from '@/domain/clock';
import { cancelBookingAction } from '@/features/resources/actions';
import { createApiClientAction, renewWebhookSecretAction, revokeApiClientAction } from '@/features/api/actions';
import { parisInstant } from '@/lib/dates';
import { apiEventsAfter, facilityApiClients } from '@/server/api';
import { deliverWebhooks, webhookSignature } from '@/server/api/webhooks';
import { setClockForTests } from '@/server/clock';
import { apiClients, apiEvents, auditEntries, bookings, incidents, resources } from '@/server/db/schema';
import { testDatabase, type TestDatabase } from '@/test/db';

let t: TestDatabase;
let token = '';
let secret = '';
let clientId = '';
let startCursor = 0;
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
  vi.setSystemTime(parisInstant('2026-10-22', '11:30'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const get = (route: (r: Request) => Promise<Response>, path: string, auth: string | null = `Bearer ${token}`) =>
  route(new Request(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} }));
const events = async () => t.db.select().from(apiEvents).orderBy(asc(apiEvents.seq));
const requestedPde = async () => (await t.db.select({ b: bookings }).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId))
  .where(and(eq(resources.facilityCode, 'PDE'), eq(bookings.status, 'requested'))).orderBy(asc(bookings.startsAt)))[0].b;

describe('clients', () => {
  it('a facility manager declares one for their facility; token kept as a hash, secret shown once; audited; no backlog', async () => {
    as('technician');
    expect(await createApiClientAction(null, form({ facilityCode: 'PDE', label: 'Supervision' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('facility_manager');
    expect(await createApiClientAction(null, form({ facilityCode: 'LAB67', label: 'Supervision' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    expect(await createApiClientAction(null, form({ facilityCode: 'PDE', label: ' ' }))).toEqual({ ok: false, error: 'Give the system a name' });
    expect(await createApiClientAction(null, form({ facilityCode: 'PDE', label: 'Supervision', webhookUrl: 'ftp://bench' }))).toMatchObject({ ok: false });
    const r = await createApiClientAction(null, form({ facilityCode: 'PDE', label: 'Supervision banc', webhookUrl: 'https://bench.pde.local/hook' }));
    expect(r).toMatchObject({ ok: true, token: expect.stringMatching(/^cra_[A-Za-z0-9_-]{43}$/), webhookSecret: expect.stringMatching(/^crw_/) });
    token = r.ok ? r.token! : '';
    secret = r.ok ? r.webhookSecret! : '';
    const [c] = await t.db.select().from(apiClients);
    clientId = c.id;
    startCursor = c.cursor;
    expect(c.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(c)).not.toContain(token);
    // Starts after the last event: the history of the demo data set is not sent.
    const top = (await events()).at(-1)?.seq ?? 0;
    expect(c.cursor).toBe(top);
    const [a] = await t.db.select().from(auditEntries).where(eq(auditEntries.entityId, c.id));
    expect(a).toMatchObject({ area: 'Facilities', objectRef: 'Facility PDE', change: 'API client added: Supervision banc · webhook https://bench.pde.local/hook' });
    // The list of the facility tab never carries the token nor the secret.
    expect(JSON.stringify(await facilityApiClients('PDE'))).not.toMatch(/cra_|crw_/);
  });
});

describe('events written by the triggers', () => {
  it('a booking cancelled or moved, an incident on a resource; not the imported history; append-only', async () => {
    const before = (await events()).length;
    const b = await requestedPde();
    as('facility_manager');
    expect(await cancelBookingAction(null, form({ bookingId: b.id, reason: 'Bench down' }))).toMatchObject({ ok: true });
    const [other] = await t.db.select().from(bookings).where(eq(bookings.status, 'confirmed')).limit(1);
    await t.db.update(bookings).set({ startsAt: new Date(other.startsAt.getTime() + 3_600_000), endsAt: new Date(other.endsAt.getTime() + 3_600_000) }).where(eq(bookings.id, other.id));
    // A change that neither moves nor changes the status writes nothing.
    await t.db.update(bookings).set({ codexRef: 'RPT-0001' }).where(eq(bookings.id, other.id));
    const after = (await events()).slice(before);
    expect(after.map((e) => [e.kind, e.bookingId])).toEqual([['booking.cancelled', b.id], ['booking.moved', other.id]]);
    const [lab] = await t.db.select({ id: resources.id }).from(resources).where(eq(resources.code, 'PDE-LAB'));
    const [inc] = await t.db.insert(incidents).values({
      ref: 'AL-2026-9001', kind: 'breakdown', resourceId: lab.id, label: 'Hotte en panne', startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), declaredByName: 'Test', declaredAt: new Date(),
    }).returning();
    await t.db.update(incidents).set({ status: 'closed' }).where(eq(incidents.id, inc.id));
    expect((await events()).slice(-2).map((e) => [e.kind, e.incidentId, e.resourceId])).toEqual([['incident.open', inc.id, lab.id], ['incident.closed', inc.id, lab.id]]);
    const n = (await events()).length;
    await t.db.update(bookings).set({ status: 'done' }).where(eq(bookings.source, 'import'));
    expect((await events()).length).toBe(n);
    const refused = async (q: Promise<unknown>) => {
      const e = await q.then(() => null, (err: { cause?: { message?: string } }) => err);
      expect(e?.cause?.message).toMatch(/append-only/);
    };
    await refused(t.db.execute(sql`delete from ${apiEvents}`));
    await refused(t.db.execute(sql`update ${apiEvents} set kind = 'x'`));
  });
});

describe('GET /api/v1', () => {
  it('a token is required; a revoked one opens nothing', async () => {
    expect((await get(getResources, '/api/v1/resources', null)).status).toBe(401);
    expect((await get(getResources, '/api/v1/resources', 'Bearer cra_' + 'x'.repeat(43))).status).toBe(401);
    expect((await get(getResources, '/api/v1/resources', 'Bearer crd_' + 'x'.repeat(43))).status).toBe(401);
  });

  it('the resources and bookings of its facility only; a confidential project masked', async () => {
    const res = await (await get(getResources, '/api/v1/resources')).json();
    expect(res.facility).toBe('PDE');
    expect(res.resources.map((r: { code: string }) => r.code)).toContain('PDE-LAB');
    expect(res.resources.every((r: { code: string }) => r.code.startsWith('PDE'))).toBe(true);
    const r = await get(getBookings, '/api/v1/bookings?from=2026-10-01&to=2026-10-31');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const body = await r.json();
    expect(body.bookings.length).toBeGreaterThan(0);
    expect(body.bookings.every((b: { facility: string }) => b.facility === 'PDE')).toBe(true);
    const conf = body.bookings.find((b: { ref: string }) => b.ref === 'B-2026-0010');
    expect(conf).toMatchObject({ confidential: true, project: null, purpose: null, operators: null, keystoneProject: null, resource: 'PDE-LAB' });
    const byRef = (ref: string) => getBooking(new Request(`http://localhost/api/v1/bookings/${ref}`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ ref }) });
    expect((await (await byRef('B-2026-0010')).json()).booking).toEqual(conf);
    // A booking of another facility does not exist for the client.
    const [lab67] = await t.db.select({ ref: bookings.ref }).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).where(eq(resources.facilityCode, 'LAB67')).limit(1);
    expect(lab67).toBeTruthy();
    expect((await byRef(lab67.ref)).status).toBe(404);
    expect((await get(getBookings, '/api/v1/bookings?resource=LAB67-ENC')).status).toBe(400);
    expect((await get(getBookings, '/api/v1/bookings?from=2026-01-01&to=2026-12-31')).status).toBe(400);
    const one = await (await get(getBookings, '/api/v1/bookings?from=2026-10-01&to=2026-10-31&resource=PDE-LAB')).json();
    expect(one.bookings.every((b: { resource: string }) => b.resource === 'PDE-LAB')).toBe(true);
  });

  it('the events of its facility, page by page, with the booking as it is now', async () => {
    const r = await (await get(getEvents, `/api/v1/events?after=${startCursor}`)).json();
    expect(r.events.length).toBeGreaterThanOrEqual(2);
    expect(r.events.every((e: { facility: string }) => e.facility === 'PDE')).toBe(true);
    expect(r.next).toBe(r.events.at(-1).id);
    const cancelled = r.events.find((e: { type: string }) => e.type === 'booking.cancelled');
    expect(cancelled.booking.status).toBe('cancelled');
    expect((await (await get(getEvents, `/api/v1/events?after=${r.next}`)).json()).events).toEqual([]);
    expect((await get(getEvents, '/api/v1/events?after=-1')).status).toBe(400);
  });
});

describe('webhooks', () => {
  it('each event of the facility posted in order, signed; a failure waits, then the next run resumes', async () => {
    const now = new Date();
    const pending = (await apiEventsAfter('PDE', (await t.db.select().from(apiClients))[0].cursor)).length;
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const run = await deliverWebhooks(t.db, now, ok);
    expect(run).toMatchObject({ clients: 1, delivered: pending, failed: 0 });
    expect(calls.length).toBe(pending);
    const first = calls[0];
    expect(first.url).toBe('https://bench.pde.local/hook');
    const ts = first.headers['X-Crucible-Timestamp'];
    expect(first.headers['X-Crucible-Signature']).toBe(`sha256=${createHmac('sha256', secret).update(`${ts}.${first.body}`).digest('hex')}`);
    expect(first.headers['X-Crucible-Signature']).toBe(webhookSignature(secret, Number(ts), first.body));
    const ids = calls.map((c) => JSON.parse(c.body).id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    const [c1] = await t.db.select().from(apiClients);
    expect(c1.cursor).toBe((await events()).at(-1)!.seq);
    // Nothing new: nothing sent.
    expect(await deliverWebhooks(t.db, now, ok)).toMatchObject({ delivered: 0 });

    // A new event; the receiver answers 500: kept, retried after 1 minute, then 2.
    await t.db.update(bookings).set({ status: 'no_show' }).where(eq(bookings.ref, 'B-2026-0010'));
    const down = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    expect(await deliverWebhooks(t.db, now, down)).toMatchObject({ failed: 1, delivered: 0 });
    let [c2] = await t.db.select().from(apiClients);
    expect(c2).toMatchObject({ failures: 1, lastError: 'HTTP 500', cursor: c1.cursor });
    expect(c2.nextAttemptAt!.getTime() - now.getTime()).toBe(60_000);
    // Not due yet: nothing tried.
    expect(await deliverWebhooks(t.db, new Date(now.getTime() + 30_000), down)).toMatchObject({ clients: 0 });
    await deliverWebhooks(t.db, new Date(now.getTime() + 61_000), down);
    [c2] = await t.db.select().from(apiClients);
    expect(c2.failures).toBe(2);
    expect(c2.nextAttemptAt!.getTime() - (now.getTime() + 61_000)).toBe(120_000);
    calls.length = 0;
    expect(await deliverWebhooks(t.db, new Date(now.getTime() + 200_000), ok)).toMatchObject({ delivered: 1 });
    expect(JSON.parse(calls[0].body)).toMatchObject({ type: 'booking.no_show', booking: { ref: 'B-2026-0010', project: null } });
    [c2] = await t.db.select().from(apiClients);
    expect(c2).toMatchObject({ failures: 0, lastError: null, nextAttemptAt: null });
  });

  it('a new signing secret replaces the old one; a revoked client receives and reads nothing', async () => {
    as('facility_manager');
    const r = await renewWebhookSecretAction(clientId);
    expect(r).toMatchObject({ ok: true, token: null, webhookSecret: expect.stringMatching(/^crw_/) });
    expect(r.ok && r.webhookSecret).not.toBe(secret);
    expect(await revokeApiClientAction(clientId)).toEqual({ ok: true });
    expect((await get(getResources, '/api/v1/resources')).status).toBe(401);
    expect(await deliverWebhooks(t.db, new Date(), (async () => new Response('')) as unknown as typeof fetch)).toMatchObject({ clients: 0 });
    as('technician');
    expect(await revokeApiClientAction(clientId)).toMatchObject({ ok: false });
  });
});
