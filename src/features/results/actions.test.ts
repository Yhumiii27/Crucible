// Test results (CR-081, X-18) on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): who may record the
// result of a test started or done (the project's lead, the R&D director, those who run the facility and see what the booking
// is for — never for a confidential project they do not see), a correction is a new version with its reason, the versions are append-only, the
// requester is notified, audited. B-2026-0010 is a test of RD-CASSIOPEE (confidential) on PDE-LAB, Thu 22 Oct 2026.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { and, eq, sql } from 'drizzle-orm';
import { REAL_CLOCK } from '@/domain/clock';
import { recordResultAction } from '@/features/results/actions';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { auditEntries, bookings, notifications, projects, testResults } from '@/server/db/schema';
import { bookingResults } from '@/server/dal/results';
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
  vi.setSystemTime(parisInstant('2026-10-22', '18:00'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const b10 = async () => (await t.db.select().from(bookings).where(eq(bookings.ref, 'B-2026-0010')))[0];

describe('recording a result', () => {
  it('once the test has started; refused to the technician of a confidential project; recorded by the project lead', async () => {
    const b = await b10();
    as('project_lead');
    const fields = { bookingId: b.id, outcome: 'pass', measurements: 'Pression max = 212 bar\nDurée; 4,2; s', rawDataRef: 'DAT-PDE-0042', elnUrl: 'https://eln.epc2i.fr/e/9' };
    expect(await recordResultAction(null, form(fields))).toEqual({ ok: false, error: 'A result is recorded once the test has started' });
    await t.db.update(bookings).set({ status: 'done', actualStartAt: b.startsAt, actualEndAt: b.endsAt }).where(eq(bookings.id, b.id));
    as('technician');
    expect(await recordResultAction(null, form(fields))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('partner');
    expect(await recordResultAction(null, form(fields))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('project_lead');
    expect(await recordResultAction(null, form({ ...fields, measurements: 'oops' }))).toMatchObject({ ok: false, error: expect.stringContaining('line 1') });
    expect(await recordResultAction(null, form(fields))).toEqual({ ok: true });
    const r = (await bookingResults([b.id])).get(b.id)!;
    expect(r.latest).toMatchObject({ version: 1, outcome: 'pass', rawDataRef: 'DAT-PDE-0042', elnUrl: 'https://eln.epc2i.fr/e/9', reason: null, recordedByName: 'Camille Fabre' });
    expect(r.latest.measurements).toEqual([{ name: 'Pression max', value: '212', unit: 'bar' }, { name: 'Durée', value: '4,2', unit: 's' }]);
    const [a] = await t.db.select().from(auditEntries).where(and(eq(auditEntries.entityType, 'test_result'), eq(auditEntries.entityId, r.latest.id)));
    expect(a).toMatchObject({ area: 'Bookings', objectRef: 'Booking B-2026-0010', change: 'test result recorded: Compliant, 2 measurements', projectCode: 'RD-CASSIOPEE' });
  });

  it('a correction by the R&D director: a new version with its reason; the requester is notified; append-only', async () => {
    const b = await b10();
    const fields = { bookingId: b.id, outcome: 'fail', measurements: 'Pression max = 21.2 MPa', observations: 'Unit corrected' };
    // The PDE manager does not see this confidential project (U-3): nothing to record.
    as('facility_manager');
    expect(await recordResultAction(null, form({ ...fields, reason: 'Wrong unit' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('rd_director');
    expect(await recordResultAction(null, form(fields))).toEqual({ ok: false, error: 'Say why the result is corrected' });
    expect(await recordResultAction(null, form({ ...fields, reason: 'Wrong unit' }))).toEqual({ ok: true });
    const r = (await bookingResults([b.id])).get(b.id)!;
    expect(r.versions.map((v) => [v.version, v.outcome])).toEqual([[1, 'pass'], [2, 'fail']]);
    expect(r.latest).toMatchObject({ reason: 'Wrong unit', recordedByName: 'Hélène Marchal' });
    const sent = await t.db.select().from(notifications).where(eq(notifications.kind, 'test_result'));
    expect(sent.map((n) => [n.userId, n.title])).toEqual([[b.requestedByUserId, 'Result of your test · B-2026-0010']]);
    const refused = async (q: Promise<unknown>) => {
      const e = await q.then(() => null, (err: { cause?: { message?: string } }) => err);
      expect(e?.cause?.message).toMatch(/append-only/);
    };
    await refused(t.db.execute(sql`update ${testResults} set outcome = 'pass'`));
    await refused(t.db.execute(sql`delete from ${testResults}`));
  });

  it('the technician and the facility manager record the result of a non-confidential test of their facility', async () => {
    const b = await b10();
    await t.db.update(projects).set({ confidential: false }).where(eq(projects.code, b.projectCode));
    as('technician');
    expect(await recordResultAction(null, form({ bookingId: b.id, outcome: 'retest', observations: 'Leak at the seal', reason: 'Seen again' }))).toEqual({ ok: true });
    expect((await bookingResults([b.id])).get(b.id)!.latest).toMatchObject({ version: 3, outcome: 'retest' });
    as('facility_manager');
    expect(await recordResultAction(null, form({ bookingId: b.id, outcome: 'pass', observations: 'Seal replaced', reason: 'Retested' }))).toEqual({ ok: true });
  });
});
