// Opening calendars and time intervals (docs/spec/02 §2, decisions R-9, F-1). Pure: instants are epoch milliseconds, dates are
// Europe/Paris ISO dates, wall-clock times are "HH:MM" in Paris. A facility opens on given weekdays between two times
// (default Monday–Friday 07:00–17:00, R-9); closures (public holidays, shutdowns) close whole days; a half-day resource is
// booked by mornings (opening → 12:00) and afternoons (12:00 → closing), F-1.
import { addDaysIso, dowOfIso, parisInstant } from '@/lib/dates';

export interface Interval {
  start: number;
  end: number;
}

/** Opening of one weekday (1 = Monday … 7 = Sunday). */
export interface WeeklyHours {
  weekday: number;
  opensAt: string;
  closesAt: string;
}

/** A closure of whole days, inclusive. */
export interface Closure {
  fromOn: string;
  toOn: string;
  label: string;
}

/** Default opening (R-9): Monday–Friday, 07:00–17:00. */
export const DEFAULT_HOURS: WeeklyHours[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensAt: '07:00', closesAt: '17:00' }));

/** The time half-days split at (F-1). */
export const NOON = '12:00';

export const HOUR_MS = 3_600_000;

/** ISO weekday of a date (1 = Monday … 7 = Sunday). */
export const isoWeekday = (iso: string) => dowOfIso(iso) || 7;

/** Monday of the week of a date. */
export const mondayOf = (iso: string) => addDaysIso(iso, 1 - isoWeekday(iso));

export const isHhmm = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function isClosedDay(iso: string, closures: readonly Closure[]): Closure | null {
  return closures.find((c) => c.fromOn <= iso && iso <= c.toOn) ?? null;
}

/** The opening window of a date, or null (weekday without hours, or a closure). */
export function dayWindow(iso: string, hours: readonly WeeklyHours[], closures: readonly Closure[] = []): Interval | null {
  if (isClosedDay(iso, closures)) return null;
  const h = hours.find((x) => x.weekday === isoWeekday(iso));
  if (!h) return null;
  const w = { start: parisInstant(iso, h.opensAt).getTime(), end: parisInstant(iso, h.closesAt).getTime() };
  return w.end > w.start ? w : null;
}

/** Morning and afternoon of an open date (a half is empty when the day opens after or closes before noon). */
export function halfDays(iso: string, hours: readonly WeeklyHours[], closures: readonly Closure[] = []): { am: Interval | null; pm: Interval | null } | null {
  const w = dayWindow(iso, hours, closures);
  if (!w) return null;
  const noon = parisInstant(iso, NOON).getTime();
  return {
    am: w.start < noon ? { start: w.start, end: Math.min(noon, w.end) } : null,
    pm: w.end > noon ? { start: Math.max(noon, w.start), end: w.end } : null,
  };
}

/** Opening windows of the dates from `fromIso` (included) to `toIso` (excluded). */
export function openWindows(hours: readonly WeeklyHours[], closures: readonly Closure[], fromIso: string, toIso: string): Interval[] {
  const out: Interval[] = [];
  for (let d = fromIso; d < toIso; d = addDaysIso(d, 1)) {
    const w = dayWindow(d, hours, closures);
    if (w) out.push(w);
  }
  return out;
}

/** Sorted, non-overlapping union of intervals. */
export function merge(xs: readonly Interval[]): Interval[] {
  const sorted = xs.filter((x) => x.end > x.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else out.push({ ...x });
  }
  return out;
}

/** Intersection of two sets of intervals. */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of merge(a)) for (const y of merge(b)) {
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
  }
  return merge(out);
}

/** `a` minus `b`. */
export function subtract(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  let rest = merge(a);
  for (const y of merge(b)) {
    rest = rest.flatMap((x) => {
      if (y.end <= x.start || y.start >= x.end) return [x];
      const parts: Interval[] = [];
      if (y.start > x.start) parts.push({ start: x.start, end: y.start });
      if (y.end < x.end) parts.push({ start: y.end, end: x.end });
      return parts;
    });
  }
  return rest;
}

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Total length in hours. */
export const hoursOf = (xs: readonly Interval[]) => merge(xs).reduce((s, x) => s + (x.end - x.start), 0) / HOUR_MS;

/** True when the instant is the opening, the closing or (half-day resources) noon of its open day. */
function isBoundary(at: number, iso: string, hours: readonly WeeklyHours[], closures: readonly Closure[], halfDay: boolean, kind: 'start' | 'end'): boolean {
  const w = dayWindow(iso, hours, closures);
  if (!w) return false;
  const noon = parisInstant(iso, NOON).getTime();
  const allowed = kind === 'start' ? [w.start, ...(noon > w.start && noon < w.end ? [noon] : [])] : [w.end, ...(noon > w.start && noon < w.end ? [noon] : [])];
  if (halfDay) return allowed.includes(at);
  return kind === 'start' ? at >= w.start && at < w.end : at > w.start && at <= w.end;
}

/**
 * True when a slot starts and ends inside opening hours of open days — on half-day boundaries for a half-day resource. A slot
 * may span several days (a test running over a weekend occupies the resource throughout).
 */
export function fitsOpening(slot: Interval, isoStart: string, isoEnd: string, hours: readonly WeeklyHours[], closures: readonly Closure[], halfDay: boolean): boolean {
  return isBoundary(slot.start, isoStart, hours, closures, halfDay, 'start') && isBoundary(slot.end, isoEnd, hours, closures, halfDay, 'end');
}

/** Date `months` calendar months after `iso` (clamped to the month's last day). */
export function addMonthsIso(iso: string, months: number): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1 + months;
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(+iso.slice(8, 10), last);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Due date of a periodic inspection (R-6): the last one plus its period. */
export const inspectionDueOn = (lastOn: string, periodMonths: number) => addMonthsIso(lastOn, periodMonths);
