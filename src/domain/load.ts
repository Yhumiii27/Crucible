// Load forecast (docs/spec/03 §6, decisions F-6, F-11, F-12; delivery 3): per resource and per week, the net capacity (opening
// hours minus closures and unavailabilities, times the capacity), what the bookings hold (confirmed, started or done), what
// the requests ask, and what the open needs not booked yet will ask — each need spread over the net open hours of its window,
// from its earliest date (or today) to its deadline. Resources tied by a validated exclusion rule (P-2: one zone of the PDE at a
// time) are also counted together against the rule's capacity. Weeks over capacity are bottlenecks, weeks of the next
// quarter under a threshold are gaps (slots to offer to the projects that could move their tests forward). Computed, never
// stored. Pure: instants are epoch milliseconds, dates Europe/Paris ISO dates, weeks their Monday.
import { addDaysIso, daysBetweenIso, parisParts } from '@/lib/dates';
import { HOUR_MS, intersect, merge, mondayOf, openWindows, subtract, type Closure, type Interval, type WeeklyHours } from './calendar';
import type { NeedLevel } from './needs';
import { HOLDING, type BookingStatus } from './resources';

export interface LoadResource {
  id: string;
  code: string;
  facilityCode: string;
  capacity: number;
}

export interface LoadBooking extends Interval {
  resourceId: string;
  status: BookingStatus;
  needId: string | null;
}

export interface LoadNeed {
  id: string;
  ref: string;
  projectCode: string;
  resourceId: string;
  level: NeedLevel;
  halfDays: number;
  earliestOn: string;
  deadlineOn: string;
}

export interface LoadRule {
  code: string;
  maxActive: number;
  resourceIds: readonly string[];
}

export interface LoadInput {
  /** Mondays of the weeks to compute, consecutive. */
  weeks: readonly string[];
  today: string;
  resources: readonly LoadResource[];
  calendars: ReadonlyMap<string, { hours: readonly WeeklyHours[]; closures: readonly Closure[] }>;
  unavailabilities: readonly (Interval & { resourceId: string })[];
  bookings: readonly LoadBooking[];
  needs: readonly LoadNeed[];
  /** Validated exclusion rules only. */
  rules: readonly LoadRule[];
}

export interface WeekLoad {
  monday: string;
  /** Net open hours × capacity (a rule: net open hours × the resources allowed at once). */
  capacityHours: number;
  /** Held by confirmed, started or done bookings. */
  bookedHours: number;
  /** Asked by requests not confirmed yet (F-10: they hold nothing, but they are load). */
  requestedHours: number;
  /** Open needs not booked yet, spread over their window, by level. */
  forecastHours: number;
  requestHours: number;
  /** booked + requested + needs. */
  loadHours: number;
  /** load / capacity; null when the resource has no capacity that week (closed, unavailable). */
  ratio: number | null;
}

export interface NeedSpread {
  id: string;
  ref: string;
  /** Hours the need asks, from its half-days (half the average open day of its facility). */
  askedHours: number;
  /** Hours of its bookings (confirmed, started, done or requested) within opening hours. */
  coveredHours: number;
  remainingHours: number;
  /** The remainder in half-days of its facility, rounded to the half-day above. */
  remainingHalfDays: number;
  /** The deadline has passed, or no open hour is left in its window: the remainder is put in the current week. */
  overdue: boolean;
}

export interface LoadForecast {
  byResource: Map<string, WeekLoad[]>;
  byRule: Map<string, WeekLoad[]>;
  needs: NeedSpread[];
}

const hours = (xs: readonly Interval[]) => xs.reduce((s, x) => s + (x.end - x.start), 0) / HOUR_MS;
const round = (n: number) => Math.round(n * 10) / 10;

/** Half a typical open day of a calendar: the average of the opening hours of the open weekdays, halved (F-1). */
export function halfDayHours(weekly: readonly WeeklyHours[]): number {
  const spans = weekly.map((h) => {
    const [oh, om] = h.opensAt.split(':').map(Number);
    const [ch, cm] = h.closesAt.split(':').map(Number);
    return (ch * 60 + cm - oh * 60 - om) / 60;
  }).filter((x) => x > 0);
  return spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length / 2 : 5;
}

/** Net open windows of a resource between two dates (end excluded). */
function netWindows(input: LoadInput, r: LoadResource, fromIso: string, toIso: string): Interval[] {
  const cal = input.calendars.get(r.facilityCode);
  if (!cal || toIso <= fromIso) return [];
  return subtract(openWindows(cal.hours, cal.closures, fromIso, toIso), input.unavailabilities.filter((u) => u.resourceId === r.id));
}

const empty = (monday: string): WeekLoad => ({ monday, capacityHours: 0, bookedHours: 0, requestedHours: 0, forecastHours: 0, requestHours: 0, loadHours: 0, ratio: null });

function finish(w: WeekLoad): WeekLoad {
  const loadHours = w.bookedHours + w.requestedHours + w.forecastHours + w.requestHours;
  return {
    monday: w.monday, capacityHours: round(w.capacityHours), bookedHours: round(w.bookedHours), requestedHours: round(w.requestedHours),
    forecastHours: round(w.forecastHours), requestHours: round(w.requestHours), loadHours: round(loadHours),
    ratio: w.capacityHours > 0 ? Math.round((loadHours / w.capacityHours) * 100) / 100 : null,
  };
}

export function loadForecast(input: LoadInput): LoadForecast {
  const weeks = [...input.weeks];
  const first = weeks[0];
  const end = weeks.length ? addDaysIso(weeks[weeks.length - 1], 7) : first;
  const index = new Map(weeks.map((m, i) => [m, i]));
  const byResource = new Map<string, WeekLoad[]>();
  const windowsOf = new Map<string, Interval[][]>();
  for (const r of input.resources) {
    const perWeek = weeks.map((m) => netWindows(input, r, m, addDaysIso(m, 7)));
    windowsOf.set(r.id, perWeek);
    const rows = weeks.map((m, i) => ({ ...empty(m), capacityHours: hours(perWeek[i]) * r.capacity }));
    for (const b of input.bookings) {
      if (b.resourceId !== r.id || b.status === 'cancelled' || b.status === 'no_show') continue;
      const held = HOLDING.includes(b.status);
      if (!held && b.status !== 'requested') continue;
      perWeek.forEach((w, i) => {
        const h = hours(intersect(w, [b]));
        if (h > 0) rows[i][held ? 'bookedHours' : 'requestedHours'] += h;
      });
    }
    byResource.set(r.id, rows);
  }

  const resById = new Map(input.resources.map((r) => [r.id, r]));
  const spreads: NeedSpread[] = [];
  for (const n of input.needs) {
    const r = resById.get(n.resourceId);
    if (!r) continue;
    const cal = input.calendars.get(r.facilityCode);
    const perHalfDay = halfDayHours(cal?.hours ?? []);
    const askedHours = n.halfDays * perHalfDay;
    const linked = input.bookings.filter((b) => b.needId === n.id && (HOLDING.includes(b.status) || b.status === 'requested'));
    const coveredHours = linked.reduce((s, b) => {
      const fromIso = parisParts(new Date(b.start)).iso;
      const toIso = addDaysIso(parisParts(new Date(b.end - 1)).iso, 1);
      return s + hours(intersect(netWindows(input, r, fromIso, toIso), [b]));
    }, 0);
    const remainingHours = Math.max(0, askedHours - coveredHours);
    const from = n.earliestOn > input.today ? n.earliestOn : input.today;
    const to = addDaysIso(n.deadlineOn, 1);
    const window = netWindows(input, r, from, to);
    const total = hours(window);
    const overdue = remainingHours > 0 && total === 0;
    spreads.push({ id: n.id, ref: n.ref, askedHours: round(askedHours), coveredHours: round(coveredHours), remainingHours: round(remainingHours), remainingHalfDays: Math.ceil(round(remainingHours) / perHalfDay), overdue });
    if (remainingHours <= 0) continue;
    const rows = byResource.get(r.id)!;
    const key = n.level === 'forecast' ? 'forecastHours' : 'requestHours';
    if (overdue) {
      const i = index.get(mondayOf(input.today));
      if (i != null) rows[i][key] += remainingHours;
      continue;
    }
    // Only the weeks of the horizon receive their share; the share of the weeks beyond it is not lost from the total.
    for (let m = mondayOf(from); m < to && m < end; m = addDaysIso(m, 7)) {
      const i = index.get(m);
      if (i == null) continue;
      const h = hours(intersect(window, merge(windowsOf.get(r.id)![i])));
      if (h > 0) rows[i][key] += (remainingHours * h) / total;
    }
  }

  const byRule = new Map<string, WeekLoad[]>();
  for (const rule of input.rules) {
    const members = rule.resourceIds.filter((id) => byResource.has(id));
    if (members.length < 2) continue;
    byRule.set(rule.code, weeks.map((m, i) => {
      const xs = members.map((id) => byResource.get(id)![i]);
      const open = Math.max(0, ...members.map((id) => hours(windowsOf.get(id)![i])));
      return finish({
        ...empty(m), capacityHours: open * Math.min(rule.maxActive, members.length),
        bookedHours: xs.reduce((s, x) => s + x.bookedHours, 0), requestedHours: xs.reduce((s, x) => s + x.requestedHours, 0),
        forecastHours: xs.reduce((s, x) => s + x.forecastHours, 0), requestHours: xs.reduce((s, x) => s + x.requestHours, 0),
      });
    }));
  }
  for (const [id, rows] of byResource) byResource.set(id, rows.map(finish));
  return { byResource, byRule, needs: spreads };
}

export interface LoadSignal {
  kind: 'bottleneck' | 'gap';
  /** Resource code or rule code. */
  subject: string;
  monday: string;
  ratio: number;
  /** Weeks from the current week (0 = this week). */
  weeksAhead: number;
}

/** Above this ratio a week is a bottleneck (F-12). */
export const BOTTLENECK_ABOVE = 1;
/** Below this ratio a week of the next `GAP_WEEKS` weeks is a gap (F-12). */
export const GAP_BELOW = 0.3;
export const GAP_WEEKS = 12;

/**
 * Bottlenecks and gaps of a forecast. A resource tied by a validated rule is judged with its rule (the rule's load is what
 * matters: one zone of the PDE at a time), except for its own bottlenecks (two tests on one zone).
 */
export function loadSignals(f: LoadForecast, subjects: { resources: readonly LoadResource[]; rules: readonly LoadRule[] }, today: string): LoadSignal[] {
  const thisWeek = mondayOf(today);
  const ahead = (m: string) => daysBetweenIso(thisWeek, m) / 7;
  const grouped = new Set(subjects.rules.filter((r) => f.byRule.has(r.code)).flatMap((r) => r.resourceIds));
  const out: LoadSignal[] = [];
  const scan = (subject: string, rows: readonly WeekLoad[], gaps: boolean) => {
    for (const w of rows) {
      if (w.ratio == null || w.monday < thisWeek) continue;
      if (w.ratio > BOTTLENECK_ABOVE) out.push({ kind: 'bottleneck', subject, monday: w.monday, ratio: w.ratio, weeksAhead: ahead(w.monday) });
      else if (gaps && w.ratio < GAP_BELOW && ahead(w.monday) < GAP_WEEKS) out.push({ kind: 'gap', subject, monday: w.monday, ratio: w.ratio, weeksAhead: ahead(w.monday) });
    }
  };
  for (const r of subjects.resources) scan(r.code, f.byResource.get(r.id) ?? [], !grouped.has(r.id));
  for (const rule of subjects.rules) scan(rule.code, f.byRule.get(rule.code) ?? [], true);
  return out.sort((a, b) => a.monday.localeCompare(b.monday) || a.subject.localeCompare(b.subject));
}

/** "2027-T1": the calendar quarter of a week (by its Monday), for the 12-month envelopes (F-6). */
export const quarterOf = (monday: string) => `${monday.slice(0, 4)}-T${Math.floor((+monday.slice(5, 7) - 1) / 3) + 1}`;

/** Weeks summed by quarter. */
export function byQuarter(rows: readonly WeekLoad[]): { quarter: string; capacityHours: number; loadHours: number; ratio: number | null }[] {
  const out = new Map<string, { capacityHours: number; loadHours: number }>();
  for (const w of rows) {
    const q = quarterOf(w.monday);
    const x = out.get(q) ?? { capacityHours: 0, loadHours: 0 };
    x.capacityHours += w.capacityHours;
    x.loadHours += w.loadHours;
    out.set(q, x);
  }
  return [...out].map(([quarter, x]) => ({
    quarter, capacityHours: round(x.capacityHours), loadHours: round(x.loadHours), ratio: x.capacityHours > 0 ? Math.round((x.loadHours / x.capacityHours) * 100) / 100 : null,
  }));
}
