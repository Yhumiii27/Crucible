// Utilisation indicators (docs/spec/02 §6, decision P-5), computed from the bookings and the calendars — never stored.
// Over a period and per resource:
// - open hours: opening hours of the facility (closures excluded); net open hours: minus the unavailabilities;
// - booked: net open hours held by a confirmed, started or done booking, or by a booking not held (it blocked the slot);
// - realised with preparation: actual start → actual end of the tests done, within the net open hours (a test running over
//   several days does not count its nights); realised: the same minus the preparation and restoring times (R-5);
// - blocked: net open hours when the resource is free but an exclusion rule forbids it to work, because enough of the other
//   resources of a validated rule are held (P-2: one zone of the PDE at a time).
// Occupation rates are these hours divided by the net open hours.
import { HOUR_MS, hoursOf, intersect, merge, subtract, type Interval } from './calendar';
import type { BookingStatus } from './resources';

export interface UsageBooking extends Interval {
  resourceId: string;
  status: BookingStatus;
  actualStart: number | null;
  actualEnd: number | null;
  setupMinutes: number;
  teardownMinutes: number;
}

export interface ResourceUsage {
  openHours: number;
  netOpenHours: number;
  bookedHours: number;
  realisedHours: number;
  realisedWithPrepHours: number;
  blockedHours: number;
  noShows: number;
}

const BLOCKING: readonly BookingStatus[] = ['confirmed', 'in_progress', 'done', 'no_show'];

/** Times when at least `k` distinct resources among `bookings` are held. */
export function heldByAtLeast(bookings: readonly UsageBooking[], k: number): Interval[] {
  const xs = bookings.filter((b) => BLOCKING.includes(b.status));
  const instants = [...new Set(xs.flatMap((b) => [b.start, b.end]))].sort((a, b) => a - b);
  const out: Interval[] = [];
  for (let i = 0; i + 1 < instants.length; i++) {
    const t = instants[i];
    const active = new Set(xs.filter((b) => b.start <= t && t < b.end).map((b) => b.resourceId));
    if (active.size >= k) out.push({ start: t, end: instants[i + 1] });
  }
  return merge(out);
}

export function resourceUsage(input: {
  resourceId: string;
  period: Interval;
  open: readonly Interval[];
  unavailable: readonly Interval[];
  bookings: readonly UsageBooking[];
  rules: readonly { maxActive: number; resourceIds: readonly string[] }[];
}): ResourceUsage {
  const open = intersect(input.open, [input.period]);
  const net = subtract(open, input.unavailable);
  const mine = input.bookings.filter((b) => b.resourceId === input.resourceId);
  const held = merge(mine.filter((b) => BLOCKING.includes(b.status)));
  let realisedWithPrep = 0;
  let realised = 0;
  for (const b of mine) {
    if (b.status !== 'done' || b.actualStart == null || b.actualEnd == null) continue;
    const span = intersect([{ start: b.actualStart, end: b.actualEnd }], net).reduce((s, x) => s + (x.end - x.start), 0);
    realisedWithPrep += span;
    realised += Math.max(0, span - (b.setupMinutes + b.teardownMinutes) * 60_000);
  }
  const blockers = merge(
    input.rules
      .filter((r) => r.resourceIds.includes(input.resourceId))
      .flatMap((r) => heldByAtLeast(input.bookings.filter((b) => b.resourceId !== input.resourceId && r.resourceIds.includes(b.resourceId)), r.maxActive)),
  );
  return {
    openHours: hoursOf(open),
    netOpenHours: hoursOf(net),
    bookedHours: hoursOf(intersect(net, held)),
    realisedHours: realised / HOUR_MS,
    realisedWithPrepHours: realisedWithPrep / HOUR_MS,
    blockedHours: hoursOf(intersect(subtract(net, held), blockers)),
    noShows: mine.filter((b) => b.status === 'no_show' && b.start >= input.period.start && b.start < input.period.end).length,
  };
}

/** Rate of `hours` over the net open hours, in %, one decimal; null without open hours. */
export const rateOf = (hours: number, netOpenHours: number) => (netOpenHours > 0 ? Math.round((1000 * hours) / netOpenHours) / 10 : null);

/** Average and maximum wait (calendar days) between the request and the start of the test, per entity. */
export function waitingByEntity(bookings: readonly { entityCode: string; requestedAt: number; start: number; status: BookingStatus }[]): {
  entityCode: string; count: number; averageDays: number; maxDays: number;
}[] {
  const by = new Map<string, number[]>();
  for (const b of bookings) {
    if (!['confirmed', 'in_progress', 'done'].includes(b.status)) continue;
    const days = Math.max(0, (b.start - b.requestedAt) / 86_400_000);
    by.set(b.entityCode, [...(by.get(b.entityCode) ?? []), days]);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([entityCode, xs]) => ({
    entityCode, count: xs.length, averageDays: Math.round((10 * xs.reduce((s, x) => s + x, 0)) / xs.length) / 10, maxDays: Math.round(10 * Math.max(...xs)) / 10,
  }));
}

/** Days of a month on which an entity holds a facility (quota of an agreement, A-3): distinct Paris dates touched. */
export function daysUsed(bookings: readonly { start: number; end: number; status: BookingStatus }[], isoOf: (ms: number) => string): number {
  const days = new Set<string>();
  for (const b of bookings) {
    if (!BLOCKING.includes(b.status) || b.status === 'no_show') continue;
    for (let t = b.start; t < b.end; t += 3 * HOUR_MS) days.add(isoOf(t));
    days.add(isoOf(b.end - 1));
  }
  return days.size;
}
