import 'server-only';
// The facts of the hard constraints of a slot on a resource (docs/spec/03 §3.1), read inside the caller's transaction: the
// resource, its calendar, the exclusion rules it is in and the bookings of every resource they tie, its unavailabilities and
// inspections around the slot. Used when a proposal becomes a booking and when a scenario moves one.
import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import { DEFAULT_HOURS, inspectionDueOn } from '@/domain/calendar';
import { bookings, inspections, resources, unavailabilities } from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { calendarsOf, rulesOf } from '@/server/dal/resources';

/** Facts of the hard constraints of a slot on a resource, inside the transaction (as a booking request). */
export async function slotFacts(tx: Tx, resourceId: string, slot: { start: number; end: number }) {
  const [res] = await tx.select().from(resources).where(eq(resources.id, resourceId));
  const cal = (await calendarsOf(tx, [res.facilityCode])).get(res.facilityCode)!;
  const rules = (await rulesOf(tx)).filter((r) => r.resourceIds.includes(res.id));
  const related = [...new Set([res.id, ...rules.flatMap((r) => r.resourceIds)])];
  const from = new Date(slot.start - 86_400_000);
  const to = new Date(slot.end + 86_400_000);
  const [bk, unav, insp] = await Promise.all([
    tx.select({ id: bookings.id, ref: bookings.ref, resourceId: bookings.resourceId, resourceCode: resources.code, start: bookings.startsAt, end: bookings.endsAt, status: bookings.status })
      .from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId))
      .where(and(inArray(bookings.resourceId, related), lt(bookings.startsAt, to), gte(bookings.endsAt, from), ne(bookings.status, 'cancelled'))),
    tx.select().from(unavailabilities).where(and(eq(unavailabilities.resourceId, res.id), lt(unavailabilities.startsAt, to), gte(unavailabilities.endsAt, from))),
    tx.select().from(inspections).where(and(eq(inspections.resourceId, res.id), eq(inspections.active, true))),
  ]);
  return {
    res,
    ctx: {
      resource: { id: res.id, code: res.code, status: res.status, capacity: res.capacity, granularity: 'half_day' as const, limits: { bufferMinutes: res.bufferMinutes, minNoticeHours: res.minNoticeHours, maxDays: res.maxDays } },
      hours: cal.hours.length ? cal.hours : DEFAULT_HOURS, closures: cal.closures,
      unavailabilities: unav.map((u) => ({ start: u.startsAt.getTime(), end: u.endsAt.getTime(), label: u.label })),
      inspections: insp.map((i) => ({ label: i.label, dueOn: inspectionDueOn(i.lastOn, i.periodMonths) })),
      bookings: bk.map((b) => ({ ...b, start: b.start.getTime(), end: b.end.getTime() })),
      rules: rules.map((r) => ({ code: r.code, maxActive: r.maxActive, status: r.status, resourceIds: r.resourceIds })),
    },
  };
}

