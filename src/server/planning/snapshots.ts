import 'server-only';
// Weekly snapshots of the utilisation (X-4; delivery 5): once a week is over, the indicators of every resource for that week —
// net open hours, booked, realised, realised with preparation, blocked by a rule, bookings not held — are computed with the
// rules of src/domain/utilisation.ts and kept: the history of the indicators, read by the dashboard trend and the view
// pub_occupation_hebdo. A week already kept is never recomputed (the history does not move when a past booking is corrected).
import { and, gte, inArray, lt, ne } from 'drizzle-orm';
import { DEFAULT_HOURS, mondayOf, openWindows } from '@/domain/calendar';
import { resourceUsage } from '@/domain/utilisation';
import { addDaysIso, parisInstant } from '@/lib/dates';
import { bookings, facilities, resources, unavailabilities, weeklySnapshots } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import { calendarsOf, rulesOf } from '@/server/dal/resources';

type Q = DB | Tx;
const ms = (d: Date) => d.getTime();

/** Computes the snapshots missing for the last `weeks` completed weeks; returns how many rows were added. */
export async function computeWeeklySnapshots(q: Q, today: string, weeks = 12, now = new Date()): Promise<number> {
  const thisMonday = mondayOf(today);
  const mondays = Array.from({ length: weeks }, (_, i) => addDaysIso(thisMonday, -7 * (weeks - i)));
  const res = await q.select().from(resources).where(ne(resources.status, 'retired'));
  if (!res.length) return 0;
  const done = await q.select({ monday: weeklySnapshots.monday, resourceId: weeklySnapshots.resourceId }).from(weeklySnapshots).where(inArray(weeklySnapshots.monday, mondays));
  const has = new Set(done.map((d) => `${d.monday}|${d.resourceId}`));
  const facs = (await q.select({ code: facilities.code }).from(facilities)).map((f) => f.code);
  const [cal, rules] = await Promise.all([calendarsOf(q, facs), rulesOf(q)]);
  const validated = rules.filter((r) => r.status === 'validated');
  let added = 0;
  for (const monday of mondays) {
    const missing = res.filter((r) => !has.has(`${monday}|${r.id}`));
    if (!missing.length) continue;
    const from = parisInstant(monday, '00:00');
    const to = parisInstant(addDaysIso(monday, 7), '00:00');
    const [unav, bk] = await Promise.all([
      q.select().from(unavailabilities).where(and(lt(unavailabilities.startsAt, to), gte(unavailabilities.endsAt, from))),
      q.select().from(bookings).where(and(lt(bookings.startsAt, to), gte(bookings.endsAt, from), ne(bookings.status, 'cancelled'))),
    ]);
    const usageBookings = bk.map((b) => ({
      resourceId: b.resourceId, start: ms(b.startsAt), end: ms(b.endsAt), status: b.status, actualStart: b.actualStartAt ? ms(b.actualStartAt) : null,
      actualEnd: b.actualEndAt ? ms(b.actualEndAt) : null, setupMinutes: b.setupMinutes, teardownMinutes: b.teardownMinutes,
    }));
    const rows = missing.map((r) => {
      const c = cal.get(r.facilityCode)!;
      const u = resourceUsage({
        resourceId: r.id, period: { start: ms(from), end: ms(to) }, open: openWindows(c.hours.length ? c.hours : DEFAULT_HOURS, c.closures, monday, addDaysIso(monday, 7)),
        unavailable: unav.filter((x) => x.resourceId === r.id).map((x) => ({ start: ms(x.startsAt), end: ms(x.endsAt) })), bookings: usageBookings, rules: validated,
      });
      return {
        monday, resourceId: r.id, netOpenHours: u.netOpenHours, bookedHours: u.bookedHours, realisedHours: u.realisedHours, realisedWithPrepHours: u.realisedWithPrepHours,
        blockedHours: u.blockedHours, noShows: u.noShows, computedAt: now,
      };
    });
    await q.insert(weeklySnapshots).values(rows).onConflictDoNothing();
    added += rows.length;
  }
  return added;
}
