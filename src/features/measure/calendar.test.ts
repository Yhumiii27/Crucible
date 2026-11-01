// Bookings in Outlook and Teams (CR-072, X-9) on a fresh PostgreSQL database with the demo data set, demo mode ("View as"):
// - a subscription address per person (shown once, kept as a hash), read with the person's rights at every request (U-3:
//   confidential projects and other entities' projects are never named); a revoked or unknown address answers 404;
// - the e-mail of a confirmed or cancelled booking carries its invitation (text/calendar, REQUEST then CANCEL, same UID);
// - the e-mail transports: SMTP (the composed message handed to the relay) and Microsoft Graph (token by client credentials,
//   sendMail with the MIME message); a failure leaves the notification for the next run.
// Business clock: the (fake) system time, Thu 22 Oct 2026.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { eq, isNull } from 'drizzle-orm';
import { GET } from '@/app/api/calendar/[token]/route';
import { REAL_CLOCK } from '@/domain/clock';
import { createCalendarFeedAction, revokeCalendarFeedAction } from '@/features/measure/actions';
import { cancelBookingAction, confirmBookingAction } from '@/features/resources/actions';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { bookings, calendarFeeds, notifications, resources } from '@/server/db/schema';
import { sendPendingMail } from '@/server/notify/mail';
import { testDatabase, type TestDatabase } from '@/test/db';

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
const read = async (token: string) => {
  const res = await GET(new Request(`http://localhost/api/calendar/${token}.ics`), { params: Promise.resolve({ token: `${token}.ics` }) });
  return { status: res.status, type: res.headers.get('content-type'), body: (await res.text()).replace(/\r\n /g, '') };
};
const resourceId = async (code: string) => (await t.db.select({ id: resources.id }).from(resources).where(eq(resources.code, code)))[0].id;
const subscribe = async (o: Record<string, string>) => {
  const r = await createCalendarFeedAction(null, form(o));
  if (!r.ok) throw new Error(r.error);
  expect(r.path).toBe(`/api/calendar/${r.secret}.ics`);
  return r.secret;
};
const summaries = (ics: string) => [...ics.matchAll(/^SUMMARY:(.*)$/gm)].map((m) => m[1].replace(/\r$/, ''));

describe('calendar subscriptions', () => {
  it('my tests, as the technician of the PDE: the confidential project is never named; kept as a hash; read time recorded', async () => {
    as('technician');
    const token = await subscribe({ scope: 'mine' });
    expect(token).toMatch(/^crc_[A-Za-z0-9_-]{43}$/);
    const [f] = await t.db.select().from(calendarFeeds);
    expect(JSON.stringify(f)).not.toContain(token);
    expect(f).toMatchObject({ role: 'technician', scope: 'mine', lastReadAt: null });
    const r = await read(token);
    expect(r.status).toBe(200);
    expect(r.type).toBe('text/calendar; charset=utf-8');
    expect(r.body).toContain('X-WR-CALNAME:Crucible · Mes essais');
    const s = summaries(r.body);
    expect(s).toContain('PDE-PIL · RD-ORION · Firing tests\\, series 1');
    expect(s.filter((x) => x.startsWith('PDE-LAB'))).toEqual(['PDE-LAB · Réservé (confidentiel)', 'PDE-LAB · Réservé (confidentiel)', 'PDE-LAB · Réservé (confidentiel)']);
    expect(r.body).not.toContain('CASSIOPEE');
    // Laboratoire 67 is not the technician's: none of its bookings.
    expect(s.some((x) => x.startsWith('LAB67'))).toBe(false);
    expect((await t.db.select().from(calendarFeeds).where(eq(calendarFeeds.id, f.id)))[0].lastReadAt).not.toBeNull();
  });

  it('a resource, as the EPC France partner: only a resource it sees; another entity’s project is "Booked · <entity>"', async () => {
    as('partner');
    expect(await createCalendarFeedAction(null, form({ scope: 'resource', resourceId: await resourceId('PDE-PIL') }))).toEqual({ ok: false, error: 'Choose a resource' });
    const token = await subscribe({ scope: 'resource', resourceId: await resourceId('LAB67-TRAC') });
    const s = summaries((await read(token)).body);
    expect(s).toContain('LAB67-TRAC · FR-LYRA · Tensile tests on samples');
    expect(s).toContain('LAB67-TRAC · Réservé · EPC2I');
    expect(s.join(' ')).not.toContain('RD-ORION');
  });

  it('a revoked, unknown or malformed address answers 404; only its owner revokes it', async () => {
    as('project_lead');
    const token = await subscribe({ scope: 'mine' });
    const [mine] = await t.db.select().from(calendarFeeds).where(eq(calendarFeeds.role, 'project_lead'));
    as('technician');
    expect(await revokeCalendarFeedAction(mine.id)).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('project_lead');
    expect(await revokeCalendarFeedAction(mine.id)).toEqual({ ok: true });
    expect((await read(token)).status).toBe(404);
    expect((await read(`crc_${'x'.repeat(43)}`)).status).toBe(404);
    expect((await read('nope')).status).toBe(404);
  });
});

describe('invitations in the e-mails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crucible-ics-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const qp = (x: string) => Buffer.from(x.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
  const raws = () => fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f), 'latin1'));
  const mails = () => raws().map(qp);

  it('confirmed (B-2026-0013, PDE workshop): REQUEST with the booking; then cancelled: CANCEL with the same UID and a higher sequence', async () => {
    const [b] = await t.db.select().from(bookings).where(eq(bookings.ref, 'B-2026-0013'));
    as('facility_manager');
    expect(await confirmBookingAction(b.id)).toMatchObject({ ok: true });
    const [n] = await t.db.select().from(notifications).where(eq(notifications.bookingId, b.id));
    expect(n).toMatchObject({ kind: 'booking_confirmed', title: 'Booking confirmed · B-2026-0013' });
    await t.db.update(notifications).set({ emailedAt: new Date() }).where(isNull(notifications.bookingId));
    const settings = { transport: 'file' as const, dir, from: 'crucible@groupe.fr', baseUrl: 'https://crucible.groupe.fr' };
    expect(await sendPendingMail(t.db, settings, new Date())).toBe(1);
    const [confirmed] = mails();
    expect(raws()[0]).toContain('Content-Type: text/calendar; charset=utf-8; method=REQUEST');
    expect(confirmed).toContain('Réservation confirmée · B-2026-0013');
    expect(confirmed).toContain("L’invitation jointe ajoute l’essai à votre agenda.");
    const uid = /UID:(\S+)/.exec(confirmed)![1];
    expect(uid).toBe(`${b.id}@crucible.epc2i`);
    expect(confirmed).toContain('SUMMARY:PDE-ATM · RD-VEGA');
    expect(confirmed).toMatch(/To: \S+@/);
    const seq1 = Number(/SEQUENCE:(\d+)/.exec(confirmed)![1]);

    vi.setSystemTime(parisInstant('2026-10-22', '15:00'));
    expect(await cancelBookingAction(null, form({ bookingId: b.id, reason: 'Pièces non livrées' }))).toEqual({ ok: true });
    expect(await sendPendingMail(t.db, settings, new Date())).toBe(1);
    const cancelled = mails()[1];
    // Headers read as written (decoding them as quoted-printable would turn "=CA" into a byte).
    expect(raws()[1]).toContain('Content-Type: text/calendar; charset=utf-8; method=CANCEL');
    expect(cancelled).toContain(`UID:${uid}`);
    expect(cancelled).toContain('STATUS:CANCELLED');
    expect(Number(/SEQUENCE:(\d+)/.exec(cancelled)![1])).toBeGreaterThan(seq1);
  });
});

describe('e-mail transports', () => {
  const pending = async () => {
    as('rd_director');
    await t.db.insert(notifications).values({ userId: (await t.db.select().from(calendarFeeds))[0].userId, kind: 'recap', title: 'Your tests of the next two weeks · B-2026-0011', createdAt: new Date() });
  };

  it('SMTP: the composed message goes to the relay with its envelope; marked sent', async () => {
    await pending();
    const smtp = vi.fn(async () => {});
    expect(await sendPendingMail(t.db, { transport: 'smtp', dir: null, from: 'crucible@groupe.fr', smtpUrl: 'smtp://relay:25' }, new Date(), { smtp })).toBe(1);
    const [[url, envelope, raw]] = smtp.mock.calls as unknown as [string, { from: string; to: string }, Buffer][];
    expect(url).toBe('smtp://relay:25');
    expect(envelope).toEqual({ from: 'crucible@groupe.fr', to: expect.stringContaining('@') });
    expect(raw.toString('utf8')).toMatch(/^From: Crucible <crucible@groupe\.fr>\r\n/);
  });

  it('Graph: a token by client credentials, then sendMail with the MIME message from the mailbox; a refusal is retried later', async () => {
    await pending();
    const graph = { tenantId: '11111111-2222-4333-8444-555555555555', clientId: 'app', clientSecret: 'secret' };
    const calls: { url: string; init: RequestInit }[] = [];
    let accept = false;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).includes('/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      return new Response(null, { status: accept ? 202 : 503 });
    }) as unknown as typeof fetch;
    const settings = { transport: 'graph' as const, dir: null, from: 'crucible@groupe.fr', graph };
    expect(await sendPendingMail(t.db, settings, new Date(), { fetch: fetchMock })).toBe(0);
    expect((await t.db.select().from(notifications).where(isNull(notifications.emailedAt))).length).toBe(1);
    accept = true;
    expect(await sendPendingMail(t.db, settings, new Date(), { fetch: fetchMock })).toBe(1);
    expect(calls[0].url).toBe('https://login.microsoftonline.com/11111111-2222-4333-8444-555555555555/oauth2/v2.0/token');
    expect(String(calls[0].init.body)).toContain('grant_type=client_credentials');
    const send = calls.at(-1)!;
    expect(send.url).toBe('https://graph.microsoft.com/v1.0/users/crucible%40groupe.fr/sendMail');
    expect((send.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(Buffer.from(String(send.init.body), 'base64').toString('utf8')).toMatch(/^From: Crucible <crucible@groupe\.fr>\r\n/);
  });
});
