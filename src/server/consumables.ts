import 'server-only';
// Consumables and stock (CR-076, X-20): the facility tab, the quantities taken when a test ends (called in the transaction that
// ends it, from the screen or a device), the bookings to come that the stock cannot cover, and the daily alerts to the facility's
// managers. The stock is never stored: it is the sum of the moves.
import { and, asc, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { ALERT_LABEL, alertsOf, balances, pickLots, shortages, type Lot, type Move } from '@/domain/consumables';
import { mondayOf } from '@/domain/calendar';
import { getDb } from '@/server/db/client';
import { bookings, consumableLots, consumableMoves, consumables, notifications, resources, testNeeds, testTypeConsumables, testTypes } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import { notify, usersWithRole } from '@/server/notify';

type Q = DB | Tx;

async function stockFacts(q: Q, consumableIds: readonly string[]) {
  if (!consumableIds.length) return { lots: [] as (Lot & { receivedAt: Date })[], moves: [] as Move[] };
  const [lots, moves] = await Promise.all([
    q.select().from(consumableLots).where(inArray(consumableLots.consumableId, [...consumableIds])),
    q.select({ consumableId: consumableMoves.consumableId, lotId: consumableMoves.lotId, quantity: consumableMoves.quantity }).from(consumableMoves).where(inArray(consumableMoves.consumableId, [...consumableIds])),
  ]);
  return { lots: lots.map((l) => ({ id: l.id, consumableId: l.consumableId, lotRef: l.lotRef, expiresOn: l.expiresOn, receivedAt: l.receivedAt })), moves };
}

/**
 * Takes the quantities the test type of a booking needs from the stock of its facility, once (a booking already counted is left
 * alone): the lots that expire first, then what is short without a lot. Returns the lines for the audit trail.
 */
export async function consumeForBooking(tx: Tx, bookingId: string, byName: string, today: string, at = new Date()): Promise<string[]> {
  const [b] = await tx.select({ facilityCode: resources.facilityCode, testTypeCode: testNeeds.testTypeCode }).from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId)).leftJoin(testNeeds, eq(testNeeds.id, bookings.needId)).where(eq(bookings.id, bookingId));
  if (!b?.testTypeCode) return [];
  const done = await tx.select({ id: consumableMoves.id }).from(consumableMoves).where(and(eq(consumableMoves.bookingId, bookingId), eq(consumableMoves.kind, 'use'))).limit(1);
  if (done.length) return [];
  const reqs = await tx.select({ consumableId: testTypeConsumables.consumableId, quantity: testTypeConsumables.quantity, name: consumables.name, unit: consumables.unit })
    .from(testTypeConsumables).innerJoin(consumables, eq(consumables.id, testTypeConsumables.consumableId))
    .where(and(eq(testTypeConsumables.testTypeCode, b.testTypeCode), eq(consumables.facilityCode, b.facilityCode), eq(consumables.active, true)));
  if (!reqs.length) return [];
  const { lots, moves } = await stockFacts(tx, reqs.map((r) => r.consumableId));
  const { byLot } = balances(moves);
  const lines: string[] = [];
  for (const r of reqs) {
    const pick = pickLots(lots, byLot, r.consumableId, r.quantity, today);
    const rows = [...pick.takes.map((x) => ({ lotId: x.lotId as string | null, quantity: x.quantity })), ...(pick.short > 0 ? [{ lotId: null, quantity: pick.short }] : [])];
    for (const x of rows) {
      await tx.insert(consumableMoves).values({ consumableId: r.consumableId, lotId: x.lotId, kind: 'use', quantity: -x.quantity, bookingId, byName, at });
    }
    lines.push(`${r.name} ${r.quantity} ${r.unit}${pick.short > 0 ? ` (${pick.short} ${r.unit} short)` : ''}`);
  }
  return lines;
}

/** The facility tab: consumables with their stock and lots, alerts, test type needs, moves of the last 30 days. */
export async function facilityConsumables(facilityCode: string, today: string) {
  const db = await getDb();
  const items = await db.select().from(consumables).where(eq(consumables.facilityCode, facilityCode)).orderBy(asc(consumables.name));
  const ids = items.map((c) => c.id);
  const { lots, moves } = await stockFacts(db, ids);
  const { stock, byLot } = balances(moves);
  const alerts = alertsOf(items.filter((c) => c.active), lots, moves, today);
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000);
  const [reqs, recent, types] = await Promise.all([
    ids.length ? db.select().from(testTypeConsumables).where(inArray(testTypeConsumables.consumableId, ids)).orderBy(asc(testTypeConsumables.testTypeCode)) : [],
    ids.length
      ? db.select({ m: consumableMoves, ref: bookings.ref }).from(consumableMoves).leftJoin(bookings, eq(bookings.id, consumableMoves.bookingId))
        .where(and(inArray(consumableMoves.consumableId, ids), gte(consumableMoves.at, since))).orderBy(desc(consumableMoves.at)).limit(100)
      : [],
    db.select({ code: testTypes.code, name: testTypes.name }).from(testTypes).where(eq(testTypes.active, true)).orderBy(asc(testTypes.code)),
  ]);
  const nameOf = new Map(items.map((c) => [c.id, c]));
  return {
    items: items.map((c) => ({
      id: c.id, name: c.name, unit: c.unit, threshold: c.threshold, active: c.active, stock: stock.get(c.id) ?? 0,
      lots: lots.filter((l) => l.consumableId === c.id && (byLot.get(l.id) ?? 0) > 0).sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'))
        .map((l) => ({ id: l.id, lotRef: l.lotRef, expiresOn: l.expiresOn, left: byLot.get(l.id) ?? 0 })),
      alerts: alerts.filter((a) => a.consumableId === c.id).map((a) => ({ kind: a.kind, lotRef: a.lotId ? lots.find((l) => l.id === a.lotId)?.lotRef ?? null : null })),
    })),
    requirements: reqs.map((r) => ({ testTypeCode: r.testTypeCode, consumableId: r.consumableId, consumable: nameOf.get(r.consumableId)?.name ?? '', unit: nameOf.get(r.consumableId)?.unit ?? '', quantity: r.quantity })),
    moves: recent.map((x) => ({ id: x.m.id, at: x.m.at, consumable: nameOf.get(x.m.consumableId)?.name ?? '', unit: nameOf.get(x.m.consumableId)?.unit ?? '', kind: x.m.kind, quantity: x.m.quantity, lotRef: x.m.lotId ? lots.find((l) => l.id === x.m.lotId)?.lotRef ?? null : null, bookingRef: x.ref, reason: x.m.reason, byName: x.m.byName })),
    testTypes: types,
    alertCount: alerts.length,
  };
}

/** Bookings among those given (requested, confirmed) that the stock cannot cover: per booking, the consumables and quantities short. */
export async function bookingShortages(bookingIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!bookingIds.length) return out;
  const db = await getDb();
  const rows = await db.select({ id: bookings.id, startsAt: bookings.startsAt, status: bookings.status, facilityCode: resources.facilityCode, testTypeCode: testNeeds.testTypeCode })
    .from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(testNeeds, eq(testNeeds.id, bookings.needId))
    .where(and(inArray(bookings.id, [...bookingIds]), isNotNull(testNeeds.testTypeCode)));
  const live = rows.filter((r) => r.status === 'requested' || r.status === 'confirmed');
  const facilities = [...new Set(live.map((r) => r.facilityCode))];
  for (const fac of facilities) {
    const items = await db.select().from(consumables).where(and(eq(consumables.facilityCode, fac), eq(consumables.active, true)));
    if (!items.length) continue;
    const reqs = await db.select().from(testTypeConsumables).where(inArray(testTypeConsumables.consumableId, items.map((c) => c.id)));
    if (!reqs.length) continue;
    // Every booking still to come on the facility counts, in start order, not only those shown.
    const ahead = await db.select({ id: bookings.id, startsAt: bookings.startsAt, testTypeCode: testNeeds.testTypeCode }).from(bookings)
      .innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(testNeeds, eq(testNeeds.id, bookings.needId))
      .where(and(eq(resources.facilityCode, fac), inArray(bookings.status, ['requested', 'confirmed']), isNotNull(testNeeds.testTypeCode)));
    const { lots, moves } = await stockFacts(db, items.map((c) => c.id));
    const short = shortages(ahead.map((a) => ({ id: a.id, testTypeCode: a.testTypeCode, day: a.startsAt.toISOString().slice(0, 10) })), reqs, lots, moves);
    for (const r of live.filter((x) => x.facilityCode === fac)) {
      const s = short.get(r.id);
      if (s) out.set(r.id, s.map((x) => { const c = items.find((i) => i.id === x.consumableId)!; return `${c.name} ${x.short} ${c.unit}`; }));
    }
  }
  return out;
}

/** Daily: the alerts of every facility to its managers — under the threshold once a week, a lot expired or expiring once. */
export async function remindConsumables(db: DB, today: string, now = new Date()): Promise<number> {
  const items = await db.select().from(consumables).where(eq(consumables.active, true));
  if (!items.length) return 0;
  const { lots, moves } = await stockFacts(db, items.map((c) => c.id));
  const alerts = alertsOf(items, lots, moves, today);
  let n = 0;
  for (const a of alerts) {
    const c = items.find((i) => i.id === a.consumableId)!;
    const lot = a.lotId ? lots.find((l) => l.id === a.lotId) : null;
    const title = `${ALERT_LABEL[a.kind]} · ${c.name}${lot ? ` · ${lot.lotRef} · ${lot.expiresOn}` : ` · ${mondayOf(today)}`}`;
    const already = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.title, title)).limit(1);
    if (already.length) continue;
    const to = await usersWithRole(db, ['facility_manager', 'coordinator'], [c.facilityCode]);
    n += await notify(db, to, { kind: 'consumable_alert', title, href: `/facilities/${encodeURIComponent(c.facilityCode)}?tab=consumables` }, { at: now });
  }
  return n;
}
