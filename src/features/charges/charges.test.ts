// Internal chargeback (CR-074, X-19) on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): a facility's
// managers add dated rates (every entity, or one) and withdraw one entered by mistake; the statement of October bills the
// realised time of a test done and the booked slot of one not held; a partner reads its entity's lines only; exported for the
// accounting. LAB67-TRAC in October: FR-LYRA (EPC France) done 09:05–11:40, RD-VEGA (EPC2I) not held 13:00–16:00.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { GET as exportGet } from '@/app/api/export/[screen]/route';
import { REAL_CLOCK } from '@/domain/clock';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { addRateAction, withdrawRateAction } from '@/features/charges/actions';
import { monthlyCharges } from '@/server/dal/charges';
import { auditEntries, chargeRates, resources } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { getViewer } from '@/server/session';
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
  vi.setSystemTime(parisInstant('2026-10-22', '11:00'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const exportOf = async (role: string, query: string) => {
  as(role);
  return exportGet(new Request(`http://localhost/api/export/report${query}`), { params: Promise.resolve({ screen: 'report' }) });
};

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const trac = async () => (await t.db.select().from(resources).where(eq(resources.code, 'LAB67-TRAC')))[0].id;

describe('rates', () => {
  it('the facility’s managers add them; another facility’s manager cannot; validated; audited', async () => {
    const id = await trac();
    as('facility_manager');
    expect(await addRateAction(null, form({ resourceId: id, eurPerHour: '100', validFrom: '2026-01-01' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('coordinator');
    expect(await addRateAction(null, form({ resourceId: id, eurPerHour: 'cheap', validFrom: '2026-01-01' }))).toMatchObject({ ok: false });
    expect(await addRateAction(null, form({ resourceId: id, eurPerHour: '100', validFrom: '2026-01-01' }))).toEqual({ ok: true });
    expect(await addRateAction(null, form({ resourceId: id, eurPerHour: '80', validFrom: '2026-10-01', entityCode: 'EPCFR' }))).toEqual({ ok: true });
    expect(await addRateAction(null, form({ resourceId: id, eurPerHour: '999', validFrom: '2026-10-01', entityCode: 'EPCFR' }))).toEqual({ ok: true });
    const [wrong] = await t.db.select().from(chargeRates).where(eq(chargeRates.centsPerHour, 99900));
    expect(await withdrawRateAction(wrong.id)).toEqual({ ok: true });
    const [a] = await t.db.select().from(auditEntries).where(and(eq(auditEntries.entityType, 'charge_rate'), eq(auditEntries.entityId, wrong.id)));
    expect(a).toBeTruthy();
    expect(await withdrawRateAction(wrong.id)).toMatchObject({ ok: false });
  });
});

describe('statement of the month', () => {
  it('the R&D director: realised time of a test done, booked slot of one not held; the entity’s rate first; lines without a rate counted', async () => {
    as('rd_director');
    const c = await monthlyCharges(await getViewer(), '2026-10', 'LAB67');
    const lines = c.groups.flatMap((g) => g.lines).filter((l) => l.resourceCode === 'LAB67-TRAC');
    const billed = lines.filter((l) => l.billedHours > 0).map((l) => [l.entityCode, l.status, l.billedHours, l.centsPerHour, l.amountCents]);
    expect(billed).toEqual(expect.arrayContaining([['EPCFR', 'done', 2.58, 8000, 20640], ['EPC2I', 'no_show', 3, 10000, 30000]]));
    expect(billed).toHaveLength(2);
    // A booking still to come is valued (booked hours) but not billed.
    expect(lines.find((l) => l.status === 'confirmed')).toMatchObject({ billedHours: 0, amountCents: 0 });
    expect(c.unrated).toBeGreaterThan(0);
    expect(c.groups.every((g) => g.lines.every((l) => l.status !== 'cancelled' && l.status !== 'requested'))).toBe(true);
  });

  it('the EPC France partner reads its entity’s lines only', async () => {
    as('partner');
    const c = await monthlyCharges(await getViewer(), '2026-10', null);
    expect(c.groups.length).toBeGreaterThan(0);
    expect(c.groups.every((g) => g.entityCode === 'EPCFR')).toBe(true);
  });

  it('exported for the accounting, one line per booking', async () => {
    const r = await exportOf('rd_director', '?month=2026-10&facility=LAB67&view=charges&format=json');
    expect(r.status).toBe(200);
    const rows = (await r.json()) as Record<string, unknown>[];
    expect(rows.some((x) => Object.values(x).includes(206.4))).toBe(true);
  });
});
