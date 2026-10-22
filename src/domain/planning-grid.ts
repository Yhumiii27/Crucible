// The week grid of the resource planning (docs/spec/05 "Planning des moyens"): one row per resource, two cells per weekday
// (morning, afternoon). A cell is closed (no opening), unavailable, held (bookings), blocked (free, but an exclusion rule
// forbids it because enough of the other resources of the rule are held — P-2), or free. Requests are shown on the cell but
// do not hold it. Pure.
import { addDaysIso } from '@/lib/dates';
import { halfDays, overlaps, type Closure, type Interval, type WeeklyHours } from './calendar';
import { HOLDING, type BookingStatus } from './resources';

export type CellState = 'closed' | 'unavailable' | 'held' | 'blocked' | 'free';

export interface GridBooking extends Interval {
  id: string;
  resourceId: string;
  status: BookingStatus;
}

export interface GridCell {
  day: string;
  half: 'am' | 'pm';
  state: CellState;
  /** Bookings overlapping the half-day (held ones and requests), in start order. */
  bookingIds: string[];
  /** What blocks the cell: an unavailability label, or "<rule code> · <resource codes>". */
  reason: string | null;
}

export function weekGrid(input: {
  monday: string;
  days?: number;
  resources: readonly { id: string; code: string; facilityCode: string; status: string }[];
  calendars: ReadonlyMap<string, { hours: readonly WeeklyHours[]; closures: readonly Closure[] }>;
  bookings: readonly GridBooking[];
  unavailabilities: readonly (Interval & { resourceId: string; label: string })[];
  rules: readonly { code: string; maxActive: number; resourceIds: readonly string[] }[];
}): Map<string, GridCell[]> {
  const days = Array.from({ length: input.days ?? 5 }, (_, i) => addDaysIso(input.monday, i));
  const codeOf = new Map(input.resources.map((r) => [r.id, r.code]));
  const out = new Map<string, GridCell[]>();
  for (const r of input.resources) {
    const cal = input.calendars.get(r.facilityCode) ?? { hours: [], closures: [] };
    const cells: GridCell[] = [];
    for (const day of days) {
      const halves = halfDays(day, cal.hours, cal.closures);
      for (const half of ['am', 'pm'] as const) {
        const slot = halves?.[half] ?? null;
        if (!slot || r.status === 'retired') {
          cells.push({ day, half, state: 'closed', bookingIds: [], reason: null });
          continue;
        }
        const here = input.bookings.filter((b) => b.resourceId === r.id && overlaps(b, slot) && b.status !== 'cancelled').sort((a, b) => a.start - b.start);
        const unav = input.unavailabilities.find((u) => u.resourceId === r.id && overlaps(u, slot));
        let state: CellState = 'free';
        let reason: string | null = null;
        if (unav || r.status !== 'in_service') {
          state = 'unavailable';
          reason = unav?.label ?? null;
        } else if (here.some((b) => HOLDING.includes(b.status) || b.status === 'no_show')) state = 'held';
        else {
          for (const rule of input.rules) {
            if (!rule.resourceIds.includes(r.id)) continue;
            const others = input.bookings.filter((b) => b.resourceId !== r.id && rule.resourceIds.includes(b.resourceId) && HOLDING.includes(b.status) && overlaps(b, slot));
            const holders = [...new Set(others.map((b) => b.resourceId))];
            if (holders.length >= rule.maxActive) {
              state = 'blocked';
              reason = `${rule.code} · ${holders.map((id) => codeOf.get(id) ?? '').sort().join(', ')}`;
              break;
            }
          }
        }
        cells.push({ day, half, state, bookingIds: here.map((b) => b.id), reason });
      }
    }
    out.set(r.id, cells);
  }
  return out;
}
