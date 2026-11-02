// Consumables and stock (CR-076, X-20) on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): the PDE's
// managers declare igniters, receive two lots and set what a firing test needs; the firing test of 27 Oct (RD-ORION, PDE-PIL,
// test type FIRING) is flagged short, then takes its igniters from the lots that expire first when it ends; alerts; corrections.
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
import { correctStockAction, receiveLotAction, saveConsumableAction, setRequirementAction } from '@/features/consumables/actions';
import { finishBookingAction } from '@/features/resources/actions';
import { bookingShortages, facilityConsumables, remindConsumables } from '@/server/consumables';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { bookings, consumableMoves, consumables, notifications } from '@/server/db/schema';
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
const firing = async () => (await t.db.select().from(bookings).where(eq(bookings.title, 'Firing tests, series 2')))[0];


describe('consumables of the PDE', () => {
  let igniters = '';
  it('the facility’s managers declare a consumable, receive lots and set what a test type needs; others cannot', async () => {
    as('technician');
    expect(await saveConsumableAction(null, form({ facilityCode: 'PDE', name: 'Igniters', unit: 'piece', threshold: '5' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    as('facility_manager');
    expect(await saveConsumableAction(null, form({ facilityCode: 'LAB67', name: 'Igniters', unit: 'piece', threshold: '5' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    expect(await saveConsumableAction(null, form({ facilityCode: 'PDE', name: 'Igniters', unit: 'piece', threshold: '5' }))).toEqual({ ok: true });
    igniters = (await t.db.select().from(consumables))[0].id;
    expect(await receiveLotAction(null, form({ consumableId: igniters, lotRef: 'L1', quantity: '10', expiresOn: '2026-11-30' }))).toEqual({ ok: true });
    expect(await receiveLotAction(null, form({ consumableId: igniters, lotRef: 'L2', quantity: '5', expiresOn: '2026-10-25' }))).toEqual({ ok: true });
    expect(await receiveLotAction(null, form({ consumableId: igniters, lotRef: 'L3', quantity: '5', expiresOn: '2026-10-01' }))).toEqual({ ok: false, error: 'This lot has already expired' });
    expect(await setRequirementAction(null, form({ consumableId: igniters, testTypeCode: 'NOPE', quantity: '12' }))).toEqual({ ok: false, error: 'Choose a test type' });
    expect(await setRequirementAction(null, form({ consumableId: igniters, testTypeCode: 'FIRING', quantity: '12' }))).toEqual({ ok: true });
    const tab = await facilityConsumables('PDE', '2026-10-22');
    expect(tab.items[0]).toMatchObject({ name: 'Igniters', stock: 15, lots: [{ lotRef: 'L2', left: 5 }, { lotRef: 'L1', left: 10 }] });
    expect(tab.items[0].alerts).toEqual([{ kind: 'expiring', lotRef: 'L2' }]);
    expect(tab.requirements).toEqual([expect.objectContaining({ testTypeCode: 'FIRING', quantity: 12 })]);
  });

  it('the firing test of 27 Oct is flagged: lot L2 will have expired, 10 left for 12', async () => {
    const b = await firing();
    expect(await bookingShortages([b.id])).toEqual(new Map([[b.id, ['Igniters 2 piece']]]));
  });

  it('when the test ends, its needs are taken from the lots that expire first, never an expired one; the shortage shows', async () => {
    const b = await firing();
    vi.setSystemTime(parisInstant('2026-10-27', '17:00'));
    await t.db.update(bookings).set({ status: 'in_progress', actualStartAt: parisInstant('2026-10-27', '08:00') }).where(eq(bookings.id, b.id));
    as('technician');
    expect(await finishBookingAction(null, form({ bookingId: b.id }))).toEqual({ ok: true });
    const used = await t.db.select().from(consumableMoves).where(eq(consumableMoves.bookingId, b.id));
    expect(used.map((m) => m.quantity).sort()).toEqual([-10, -2]);
    expect(used.find((m) => m.quantity === -2)!.lotId).toBeNull();
    const tab = await facilityConsumables('PDE', '2026-10-27');
    expect(tab.items[0].stock).toBe(3);
    expect(tab.items[0].alerts.map((a) => a.kind).sort()).toEqual(['expired', 'low_stock']);
    // The daily alerts: once.
    expect(await remindConsumables(t.db, '2026-10-27')).toBeGreaterThan(0);
    expect(await remindConsumables(t.db, '2026-10-27')).toBe(0);
    expect((await t.db.select().from(notifications).where(eq(notifications.kind, 'consumable_alert'))).length).toBeGreaterThan(0);
  });

  it('a discard of the expired lot, with its reason; the moves are append-only', async () => {
    as('facility_manager');
    const lot = (await facilityConsumables('PDE', '2026-10-27')).items[0].lots.find((l) => l.lotRef === 'L2')!;
    expect(await correctStockAction(null, form({ consumableId: igniters, kind: 'discard', lotId: lot.id, quantity: '5', reason: '' }))).toEqual({ ok: false, error: 'Give the reason' });
    expect(await correctStockAction(null, form({ consumableId: igniters, kind: 'discard', lotId: lot.id, quantity: '5', reason: 'Expired' }))).toEqual({ ok: true });
    expect((await facilityConsumables('PDE', '2026-10-27')).items[0]).toMatchObject({ stock: -2, lots: [] });
    const refused = async (q: Promise<unknown>) => {
      const e = await q.then(() => null, (err: { cause?: { message?: string } }) => err);
      expect(e?.cause?.message).toMatch(/append-only/);
    };
    await refused(t.db.execute(sql`delete from ${consumableMoves}`));
  });
});
