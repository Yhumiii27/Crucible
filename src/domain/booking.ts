// The hard constraints of a booking (docs/spec/03 §3.1) and the warnings that go with it. Pure: the Server Functions load the
// facts, call checkBooking inside their transaction, and refuse on any error — citing the rule, the booking or the
// inspection that blocks. Nothing here moves another booking (the engine proposes, a person decides).
import { addWorkdaysIso } from './clock';
import { fitsOpening, halfDays, merge, overlaps, type Closure, type Interval, type WeeklyHours } from './calendar';
import { HOLDING, type BookingStatus, type Granularity, type ResourceStatus } from './resources';
import { parisInstant, parisParts } from '@/lib/dates';

export type IssueCode =
  | 'not_in_service' | 'bad_interval' | 'in_past' | 'outside_hours' | 'unavailable' | 'inspection_due' | 'capacity' | 'exclusion'
  | 'competing_request' | 'late_request' | 'proposed_rule' | 'buffer' | 'short_notice' | 'too_long';

/** EN source sentence of each issue; the page shows it with its reference (a rule code, a booking reference…). */
export const ISSUE_LABEL: Record<IssueCode, string> = {
  not_in_service: 'The resource is not in service',
  bad_interval: 'The end comes before the start',
  in_past: 'The slot has already started',
  outside_hours: 'Outside the facility’s opening hours or half-days',
  unavailable: 'The resource is unavailable',
  inspection_due: 'A regulatory inspection falls due before the end of the slot',
  capacity: 'The resource is already booked',
  exclusion: 'Exclusion rule',
  competing_request: 'Another request competes for this slot',
  late_request: 'Late request: less notice than agreed',
  proposed_rule: 'An exclusion rule awaiting validation concerns this slot',
  buffer: 'Too close to another booking of the resource: free time is kept between two bookings',
  short_notice: 'Less notice than the resource asks for a new request',
  too_long: 'Longer than the resource allows for one booking',
};

export interface Issue {
  code: IssueCode;
  /** Typed reference shown as is: a rule code, a booking reference, an inspection or unavailability label. */
  ref: string | null;
}

export interface ResourceFacts {
  id: string;
  code: string;
  status: ResourceStatus;
  capacity: number;
  granularity: Granularity;
  /** Limits of a booking of the resource (CR-078); absent = none. */
  limits?: ResourceLimits;
}

/** Limits a facility manager sets on a resource (CR-078, X-11). */
export interface ResourceLimits {
  /** Free time kept between two bookings of a resource of capacity 1 (restoring, cleaning). */
  bufferMinutes: number;
  /** Least notice of a new request, in hours; null = none. */
  minNoticeHours: number | null;
  /** Most calendar days a booking may span; null = no limit. */
  maxDays: number | null;
}

export const NO_LIMITS: ResourceLimits = { bufferMinutes: 0, minNoticeHours: null, maxDays: null };

/** Checks the limits typed by a facility manager. */
export function checkLimits(raw: Record<string, unknown>): { ok: true; value: ResourceLimits } | { ok: false; error: string } {
  const num = (k: string) => {
    const s = String(raw[k] ?? '').trim();
    return s === '' ? null : Number(s);
  };
  const buffer = num('bufferMinutes') ?? 0;
  const notice = num('minNoticeHours');
  const days = num('maxDays');
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 1440) return { ok: false, error: 'Free time between bookings: 0 to 1,440 minutes' };
  if (notice !== null && (!Number.isInteger(notice) || notice < 1 || notice > 2160)) return { ok: false, error: 'Least notice: 1 to 2,160 hours, or empty' };
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 366)) return { ok: false, error: 'Longest booking: 1 to 366 days, or empty' };
  return { ok: true, value: { bufferMinutes: buffer, minNoticeHours: notice, maxDays: days } };
}

/** Calendar days a slot spans (Paris days, first and last included). */
export function spannedDays(slot: { start: number; end: number }): number {
  const a = parisParts(new Date(slot.start)).iso;
  const b = parisParts(new Date(slot.end - 1)).iso;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
}

export interface BookingFacts {
  id: string;
  ref: string;
  resourceId: string;
  resourceCode: string;
  start: number;
  end: number;
  status: BookingStatus;
}

export interface RuleFacts {
  code: string;
  maxActive: number;
  status: 'proposed' | 'validated' | 'retired';
  resourceIds: readonly string[];
}

export interface BookingContext {
  resource: ResourceFacts;
  hours: readonly WeeklyHours[];
  closures: readonly Closure[];
  unavailabilities: readonly (Interval & { label: string })[];
  inspections: readonly { label: string; dueOn: string }[];
  /** Bookings of the resource and of every resource sharing a rule with it, around the slot. */
  bookings: readonly BookingFacts[];
  rules: readonly RuleFacts[];
  /** Business instant: a slot already started is refused. */
  now: number;
  /** Working days of notice agreed for the requesting entity (A-3, F-5); null = none asked. */
  noticeWorkdays: number | null;
  /** A new request (a person's request, a proposal of the engine): the resource's least notice applies (CR-078); not to a
   * booking checked again, moved by a recovery scenario or an urgency (A-8). */
  newRequest?: boolean;
}

export interface Candidate {
  /** Set when an existing booking is checked again (confirmation): it never conflicts with itself. */
  id?: string;
  start: number;
  end: number;
}

/** Most distinct resources holding a booking at the same instant during the slot. */
function peakDistinct(bookings: readonly BookingFacts[], slot: Interval): number {
  const xs = bookings.filter((b) => overlaps(b, slot)).map((b) => ({ ...b, start: Math.max(b.start, slot.start), end: Math.min(b.end, slot.end) }));
  const instants = [...new Set(xs.flatMap((b) => [b.start, b.end]))].sort((a, b) => a - b);
  let peak = 0;
  for (const t of instants) {
    const active = new Set(xs.filter((b) => b.start <= t && t < b.end).map((b) => b.resourceId));
    peak = Math.max(peak, active.size);
  }
  return peak;
}

/** Most bookings of one resource at the same instant during the slot. */
function peakCount(bookings: readonly BookingFacts[], slot: Interval): number {
  const xs = bookings.filter((b) => overlaps(b, slot));
  const instants = [...new Set(xs.flatMap((b) => [Math.max(b.start, slot.start), b.end]))].filter((t) => t < slot.end);
  return instants.reduce((peak, t) => Math.max(peak, xs.filter((b) => b.start <= t && t < b.end).length), 0);
}

export function checkBooking(c: Candidate, ctx: BookingContext): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const r = ctx.resource;
  if (r.status !== 'in_service') errors.push({ code: 'not_in_service', ref: r.code });
  if (!(c.end > c.start)) return { errors: [...errors, { code: 'bad_interval', ref: null }], warnings };
  if (c.start < ctx.now) errors.push({ code: 'in_past', ref: null });
  const isoStart = parisParts(new Date(c.start)).iso;
  const isoEnd = parisParts(new Date(c.end - 1)).iso;
  if (!fitsOpening(c, isoStart, isoEnd, ctx.hours, ctx.closures, r.granularity === 'half_day')) errors.push({ code: 'outside_hours', ref: null });
  for (const u of ctx.unavailabilities) if (overlaps(u, c)) errors.push({ code: 'unavailable', ref: u.label });
  for (const i of ctx.inspections) if (i.dueOn < isoEnd) errors.push({ code: 'inspection_due', ref: `${i.label} · ${i.dueOn}` });

  const others = ctx.bookings.filter((b) => b.id !== c.id);
  const holding = others.filter((b) => HOLDING.includes(b.status));
  const mine = holding.filter((b) => b.resourceId === r.id);
  if (peakCount(mine, c) + 1 > r.capacity) errors.push({ code: 'capacity', ref: mine.filter((b) => overlaps(b, c)).map((b) => b.ref).join(', ') });
  for (const rule of ctx.rules) {
    if (rule.status === 'retired' || !rule.resourceIds.includes(r.id)) continue;
    const partners = (rule.status === 'validated' ? holding : others.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show'))
      .filter((b) => b.resourceId !== r.id && rule.resourceIds.includes(b.resourceId));
    if (peakDistinct(partners, c) + 1 <= rule.maxActive) continue;
    const by = [...new Set(partners.filter((b) => overlaps(b, c)).map((b) => b.resourceCode))].sort().join(', ');
    if (rule.status === 'validated') errors.push({ code: 'exclusion', ref: `${rule.code} · ${by}` });
    else warnings.push({ code: 'proposed_rule', ref: `${rule.code} · ${by}` });
  }
  const lim = r.limits ?? NO_LIMITS;
  if (lim.maxDays != null && spannedDays(c) > lim.maxDays) errors.push({ code: 'too_long', ref: `${lim.maxDays} d` });
  if (ctx.newRequest && lim.minNoticeHours != null && c.start < ctx.now + lim.minNoticeHours * 3_600_000) errors.push({ code: 'short_notice', ref: `${lim.minNoticeHours} h` });
  if (lim.bufferMinutes > 0 && r.capacity === 1) {
    const gap = lim.bufferMinutes * 60_000;
    const near = mine.filter((b) => !overlaps(b, c) && b.start < c.end + gap && b.end > c.start - gap);
    if (near.length) errors.push({ code: 'buffer', ref: `${lim.bufferMinutes} min · ${near.map((b) => b.ref).join(', ')}` });
  }
  for (const b of others) if (b.status === 'requested' && b.resourceId === r.id && overlaps(b, c)) warnings.push({ code: 'competing_request', ref: b.ref });
  if (ctx.noticeWorkdays != null && ctx.noticeWorkdays > 0) {
    const today = parisParts(new Date(ctx.now)).iso;
    if (isoStart < addWorkdaysIso(today, ctx.noticeWorkdays)) warnings.push({ code: 'late_request', ref: null });
  }
  return { errors, warnings };
}

/** A confirmed booking not started two hours after its start may be released as not held (A-7). */
export const NO_SHOW_AFTER_MS = 2 * 3_600_000;

export function canMarkNoShow(b: { status: BookingStatus; start: number }, now: number): boolean {
  return b.status === 'confirmed' && now >= b.start + NO_SHOW_AFTER_MS;
}

/** Transitions of a booking (who may run them is decided by the Server Functions). */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  const next: Record<BookingStatus, readonly BookingStatus[]> = {
    requested: ['confirmed', 'cancelled'],
    confirmed: ['in_progress', 'cancelled', 'no_show', 'done'],
    in_progress: ['done'],
    done: [],
    cancelled: [],
    no_show: [],
  };
  return next[from].includes(to);
}

/** Intervals holding a resource, merged. */
export const heldIntervals = (bookings: readonly { start: number; end: number; status: BookingStatus }[]) =>
  merge(bookings.filter((b) => HOLDING.includes(b.status)).map((b) => ({ start: b.start, end: b.end })));

/** The instants of a slot typed by dates and halves (half-day resources) or times (hour resources); null when a day is closed. */
export function slotInterval(
  s: { fromOn: string; toOn: string; fromHalf: 'am' | 'pm'; toHalf: 'am' | 'pm'; fromTime: string; toTime: string },
  granularity: Granularity,
  hours: readonly WeeklyHours[],
  closures: readonly Closure[],
): Interval | null {
  if (granularity === 'hour') return { start: parisInstant(s.fromOn, s.fromTime).getTime(), end: parisInstant(s.toOn, s.toTime).getTime() };
  const first = halfDays(s.fromOn, hours, closures);
  const last = halfDays(s.toOn, hours, closures);
  const start = first?.[s.fromHalf]?.start;
  const end = last?.[s.toHalf]?.end;
  return start != null && end != null ? { start, end } : null;
}
