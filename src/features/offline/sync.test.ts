// Starts and ends recorded on a phone without network (CR-082, X-21), sent when the network is back, on a fresh PostgreSQL
// database with the demo data set, demo mode ("View as"): applied at the instant recorded with every check of the screen (rights,
// transition, safety checklist), in the order they happened; too old, in the future or malformed records are refused, one by one.
// B-2026-0010: PDE-LAB, Thu 22 Oct 2026 12:00–17:00, confirmed.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { eq } from 'drizzle-orm';
import { REAL_CLOCK } from '@/domain/clock';
import { syncOfflineEventsAction } from '@/features/resources/actions';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { auditEntries, bookings } from '@/server/db/schema';
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
  vi.setSystemTime(parisInstant('2026-10-22', '17:30'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const b10 = async () => (await t.db.select().from(bookings).where(eq(bookings.ref, 'B-2026-0010')))[0];

describe('syncOfflineEventsAction', () => {
  it('refuses malformed, future or too old records and what is outside the workspace, one by one', async () => {
    const b = await b10();
    as('technician');
    const r = await syncOfflineEventsAction([
      { bookingId: 'nope', kind: 'start', at: Date.now() },
      { bookingId: b.id, kind: 'start', at: Date.now() + 3_600_000 },
      { bookingId: b.id, kind: 'start', at: Date.now() - 49 * 3_600_000 },
    ]);
    expect(r.map((x) => x.ok)).toEqual([false, false, false]);
    expect(r.map((x) => x.error)).toEqual(['Recorded offline too long ago: enter it on the screen', 'Invalid offline record', 'Recorded offline in the future: check the phone’s clock']);
    as('partner');
    expect(await syncOfflineEventsAction([{ bookingId: b.id, kind: 'start', at: parisInstant('2026-10-22', '12:05').getTime() }])).toEqual([{ bookingId: b.id, kind: 'start', ok: false, error: 'This action is not in your workspace' }]);
    expect((await b10()).status).toBe('confirmed');
  });

  it('applies a start and an end at the instants recorded, in the order they happened; audited as recorded offline', async () => {
    const b = await b10();
    as('technician');
    const start = parisInstant('2026-10-22', '12:05').getTime();
    const end = parisInstant('2026-10-22', '16:40').getTime();
    const r = await syncOfflineEventsAction([{ bookingId: b.id, kind: 'end', at: end }, { bookingId: b.id, kind: 'start', at: start }]);
    expect(r).toEqual([{ bookingId: b.id, kind: 'start', ok: true }, { bookingId: b.id, kind: 'end', ok: true }]);
    const after = await b10();
    expect(after).toMatchObject({ status: 'done' });
    expect(after.actualStartAt!.getTime()).toBe(start);
    expect(after.actualEndAt!.getTime()).toBe(end);
    const audit = await t.db.select().from(auditEntries).where(eq(auditEntries.entityId, b.id));
    expect(audit.filter((a) => a.change.includes('recorded offline')).length).toBe(2);
    // Sent twice (the answer was lost): the second time is refused, nothing changes.
    expect((await syncOfflineEventsAction([{ bookingId: b.id, kind: 'end', at: end }]))[0]).toMatchObject({ ok: false, error: 'This booking cannot be ended' });
  });
});
