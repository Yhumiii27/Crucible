import { describe, expect, it } from 'vitest';
import { parisInstant } from '@/lib/dates';
import { DEFAULT_HOURS } from './calendar';
import { canMarkNoShow, canTransition, checkBooking, checkLimits, slotInterval, spannedDays, type BookingContext, type BookingFacts } from './booking';

const at = (iso: string, hhmm: string) => parisInstant(iso, hhmm).getTime();
const zone = (id: string) => ({ id, code: id, status: 'in_service' as const, capacity: 1, granularity: 'half_day' as const });
const booking = (ref: string, resourceId: string, start: number, end: number, status: BookingFacts['status'] = 'confirmed'): BookingFacts =>
  ({ id: ref, ref, resourceId, resourceCode: resourceId, start, end, status });
const pdeRule = { code: 'PDE-ONE-ZONE', maxActive: 1, status: 'validated' as const, resourceIds: ['PDE-ATM', 'PDE-PIL', 'PDE-LAB'] };

const ctx = (over: Partial<BookingContext> = {}): BookingContext => ({
  resource: zone('PDE-PIL'), hours: DEFAULT_HOURS, closures: [], unavailabilities: [], inspections: [], bookings: [], rules: [pdeRule],
  now: at('2026-10-22', '10:00'), noticeWorkdays: null, ...over,
});
const tuesdayAm = { start: at('2026-11-03', '07:00'), end: at('2026-11-03', '12:00') };
const codes = (r: ReturnType<typeof checkBooking>) => ({ errors: r.errors.map((e) => e.code), warnings: r.warnings.map((w) => w.code) });

describe('hard constraints of a booking', () => {
  it('a free half-day of the pilot passes', () => {
    expect(checkBooking(tuesdayAm, ctx())).toEqual({ errors: [], warnings: [] });
  });

  it('P-2: one zone of the PDE at a time — the workshop held that morning forbids the pilot, citing the rule', () => {
    const r = checkBooking(tuesdayAm, ctx({ bookings: [booking('B-1', 'PDE-ATM', at('2026-11-03', '07:00'), at('2026-11-03', '17:00'))] }));
    expect(r.errors).toEqual([{ code: 'exclusion', ref: 'PDE-ONE-ZONE · PDE-ATM' }]);
    // The afternoon of the workshop does not touch the pilot's morning of the next day.
    expect(checkBooking({ start: at('2026-11-04', '07:00'), end: at('2026-11-04', '12:00') }, ctx({ bookings: [booking('B-1', 'PDE-ATM', at('2026-11-03', '12:00'), at('2026-11-03', '17:00'))] })).errors).toEqual([]);
    // A mere request on another zone does not hold it: it is no exclusion yet.
    expect(codes(checkBooking(tuesdayAm, ctx({ bookings: [booking('B-2', 'PDE-LAB', tuesdayAm.start, tuesdayAm.end, 'requested')] })))).toEqual({ errors: [], warnings: [] });
  });

  it('a rule awaiting validation only warns; a retired rule says nothing', () => {
    const held = [booking('B-1', 'PDE-ATM', tuesdayAm.start, tuesdayAm.end)];
    expect(codes(checkBooking(tuesdayAm, ctx({ bookings: held, rules: [{ ...pdeRule, status: 'proposed' }] })))).toEqual({ errors: [], warnings: ['proposed_rule'] });
    expect(codes(checkBooking(tuesdayAm, ctx({ bookings: held, rules: [{ ...pdeRule, status: 'retired' }] })))).toEqual({ errors: [], warnings: [] });
  });

  it('a rule allowing two zones refuses only the third', () => {
    const two = { ...pdeRule, maxActive: 2 };
    const one = [booking('B-1', 'PDE-ATM', tuesdayAm.start, tuesdayAm.end)];
    expect(checkBooking(tuesdayAm, ctx({ bookings: one, rules: [two] })).errors).toEqual([]);
    const both = [...one, booking('B-2', 'PDE-LAB', tuesdayAm.start, tuesdayAm.end)];
    expect(codes(checkBooking(tuesdayAm, ctx({ bookings: both, rules: [two] }))).errors).toEqual(['exclusion']);
  });

  it('capacity: a resource held is refused; a room of two places takes two; a competing request warns', () => {
    const held = [booking('B-9', 'PDE-PIL', tuesdayAm.start, tuesdayAm.end)];
    expect(checkBooking(tuesdayAm, ctx({ bookings: held })).errors).toEqual([{ code: 'capacity', ref: 'B-9' }]);
    expect(checkBooking(tuesdayAm, ctx({ bookings: held, resource: { ...zone('PDE-PIL'), capacity: 2 } })).errors).toEqual([]);
    expect(checkBooking({ ...tuesdayAm, id: 'B-9' }, ctx({ bookings: held })).errors).toEqual([]);
    const req = [booking('B-8', 'PDE-PIL', tuesdayAm.start, tuesdayAm.end, 'requested')];
    expect(checkBooking(tuesdayAm, ctx({ bookings: req })).warnings).toEqual([{ code: 'competing_request', ref: 'B-8' }]);
  });

  it('calendar, status, unavailability, inspection due (R-6), past slots', () => {
    expect(codes(checkBooking({ start: at('2026-11-03', '09:00'), end: at('2026-11-03', '12:00') }, ctx())).errors).toEqual(['outside_hours']);
    expect(codes(checkBooking(tuesdayAm, ctx({ resource: { ...zone('PDE-PIL'), status: 'maintenance' } }))).errors).toEqual(['not_in_service']);
    expect(checkBooking(tuesdayAm, ctx({ unavailabilities: [{ start: at('2026-11-02', '00:00'), end: at('2026-11-05', '00:00'), label: 'Annual maintenance' }] })).errors)
      .toEqual([{ code: 'unavailable', ref: 'Annual maintenance' }]);
    expect(checkBooking(tuesdayAm, ctx({ inspections: [{ label: 'Electrical check', dueOn: '2026-11-02' }] })).errors).toEqual([{ code: 'inspection_due', ref: 'Electrical check · 2026-11-02' }]);
    expect(checkBooking(tuesdayAm, ctx({ inspections: [{ label: 'Electrical check', dueOn: '2026-11-03' }] })).errors).toEqual([]);
    expect(codes(checkBooking({ start: at('2026-10-22', '07:00'), end: at('2026-10-22', '12:00') }, ctx())).errors).toEqual(['in_past']);
    expect(codes(checkBooking({ start: tuesdayAm.end, end: tuesdayAm.start }, ctx())).errors).toEqual(['bad_interval']);
  });

  it('notice: a request with less notice than agreed is late (warning)', () => {
    expect(codes(checkBooking(tuesdayAm, ctx({ noticeWorkdays: 10 }))).warnings).toEqual(['late_request']);
    expect(codes(checkBooking(tuesdayAm, ctx({ noticeWorkdays: 5 }))).warnings).toEqual([]);
  });
});

describe('slots, transitions and no-shows', () => {
  it('a half-day slot from dates and halves; an hour slot from times', () => {
    const s = { fromOn: '2026-11-03', toOn: '2026-11-04', fromHalf: 'pm' as const, toHalf: 'am' as const, fromTime: '', toTime: '' };
    expect(slotInterval(s, 'half_day', DEFAULT_HOURS, [])).toEqual({ start: at('2026-11-03', '12:00'), end: at('2026-11-04', '12:00') });
    expect(slotInterval({ ...s, fromOn: '2026-11-01' }, 'half_day', DEFAULT_HOURS, [])).toBeNull();
    expect(slotInterval({ ...s, toOn: '2026-11-03', fromTime: '08:30', toTime: '10:00' }, 'hour', DEFAULT_HOURS, [])).toEqual({ start: at('2026-11-03', '08:30'), end: at('2026-11-03', '10:00') });
  });

  it('transitions and the two-hour no-show rule (A-7)', () => {
    expect(canTransition('requested', 'confirmed')).toBe(true);
    expect(canTransition('done', 'cancelled')).toBe(false);
    expect(canTransition('in_progress', 'done')).toBe(true);
    const b = { status: 'confirmed' as const, start: at('2026-10-22', '07:00') };
    expect(canMarkNoShow(b, at('2026-10-22', '08:59'))).toBe(false);
    expect(canMarkNoShow(b, at('2026-10-22', '09:00'))).toBe(true);
    expect(canMarkNoShow({ ...b, status: 'in_progress' }, at('2026-10-22', '12:00'))).toBe(false);
  });
});

describe('limits of a resource (CR-078, X-11)', () => {
  const limited = (limits: { bufferMinutes: number; minNoticeHours: number | null; maxDays: number | null }) => ({ ...zone('PDE-PIL'), limits });
  const pm = { start: at('2026-11-03', '12:00'), end: at('2026-11-03', '17:00') };

  it('free time between two bookings: the next half-day is refused, the day after passes; not on a room of two places', () => {
    const held = [booking('B-9', 'PDE-PIL', tuesdayAm.start, tuesdayAm.end)];
    const r = checkBooking(pm, ctx({ bookings: held, resource: limited({ bufferMinutes: 60, minNoticeHours: null, maxDays: null }) }));
    expect(r.errors).toEqual([{ code: 'buffer', ref: '60 min · B-9' }]);
    expect(checkBooking({ start: at('2026-11-04', '07:00'), end: at('2026-11-04', '12:00') }, ctx({ bookings: held, resource: limited({ bufferMinutes: 60, minNoticeHours: null, maxDays: null }) })).errors).toEqual([]);
    expect(checkBooking(pm, ctx({ bookings: held, resource: { ...limited({ bufferMinutes: 60, minNoticeHours: null, maxDays: null }), capacity: 2 } })).errors).toEqual([]);
    // A request does not hold the resource: no free time owed to it.
    expect(checkBooking(pm, ctx({ bookings: [booking('B-8', 'PDE-PIL', tuesdayAm.start, tuesdayAm.end, 'requested')], resource: limited({ bufferMinutes: 60, minNoticeHours: null, maxDays: null }) })).errors).toEqual([]);
  });

  it('least notice: only for a new request; a booking checked again or moved is not refused', () => {
    const res = limited({ bufferMinutes: 0, minNoticeHours: 24 * 14, maxDays: null });
    expect(checkBooking(tuesdayAm, ctx({ resource: res, newRequest: true })).errors).toEqual([{ code: 'short_notice', ref: '336 h' }]);
    expect(checkBooking(tuesdayAm, ctx({ resource: res })).errors).toEqual([]);
    expect(checkBooking({ start: at('2026-11-10', '07:00'), end: at('2026-11-10', '12:00') }, ctx({ resource: res, newRequest: true })).errors).toEqual([]);
  });

  it('longest booking, in calendar days spanned', () => {
    const res = limited({ bufferMinutes: 0, minNoticeHours: null, maxDays: 2 });
    expect(spannedDays({ start: at('2026-11-03', '07:00'), end: at('2026-11-05', '17:00') })).toBe(3);
    expect(checkBooking({ start: at('2026-11-03', '07:00'), end: at('2026-11-04', '17:00') }, ctx({ resource: res })).errors).toEqual([]);
    expect(checkBooking({ start: at('2026-11-03', '07:00'), end: at('2026-11-05', '17:00') }, ctx({ resource: res })).errors).toEqual([{ code: 'too_long', ref: '2 d' }]);
  });

  it('limits typed by a manager', () => {
    expect(checkLimits({ bufferMinutes: '30', minNoticeHours: '', maxDays: '5' })).toEqual({ ok: true, value: { bufferMinutes: 30, minNoticeHours: null, maxDays: 5 } });
    expect(checkLimits({})).toEqual({ ok: true, value: { bufferMinutes: 0, minNoticeHours: null, maxDays: null } });
    expect(checkLimits({ bufferMinutes: '-1' }).ok).toBe(false);
    expect(checkLimits({ minNoticeHours: '0' }).ok).toBe(false);
    expect(checkLimits({ maxDays: '1.5' }).ok).toBe(false);
  });
});

describe('maintenance and calibration due (CR-073)', () => {
  it('a blocking plan due before the end of the slot refuses it, citing the plan', () => {
    expect(checkBooking(tuesdayAm, ctx({ maintenance: [{ label: 'Load cell', dueOn: '2026-11-02' }] })).errors).toEqual([{ code: 'maintenance_due', ref: 'Load cell · 2026-11-02' }]);
    expect(checkBooking(tuesdayAm, ctx({ maintenance: [{ label: 'Load cell', dueOn: '2026-11-04' }] })).errors).toEqual([]);
  });
});
