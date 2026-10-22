import { describe, expect, it } from 'vitest';
import { parisInstant } from '@/lib/dates';
import { DEFAULT_HOURS, openWindows } from './calendar';
import { daysUsed, rateOf, resourceUsage, waitingByEntity, type UsageBooking } from './utilisation';

const at = (iso: string, hhmm: string) => parisInstant(iso, hhmm).getTime();
const week = { start: at('2026-10-19', '00:00'), end: at('2026-10-26', '00:00') };
const open = openWindows(DEFAULT_HOURS, [], '2026-10-19', '2026-10-26');
const b = (resourceId: string, day: string, from: string, to: string, status: UsageBooking['status'], actual?: [string, string]): UsageBooking => ({
  resourceId, status, start: at(day, from), end: at(day, to), setupMinutes: 60, teardownMinutes: 30,
  actualStart: actual ? at(day, actual[0]) : null, actualEnd: actual ? at(day, actual[1]) : null,
});
const rule = { maxActive: 1, resourceIds: ['ATM', 'PIL', 'LAB'] };

describe('utilisation of a resource (P-5)', () => {
  it('booked, realised with and without preparation, blocked by the PDE rule, not held', () => {
    const bookings = [
      b('PIL', '2026-10-19', '07:00', '17:00', 'done', ['07:15', '16:45']),
      b('PIL', '2026-10-20', '07:00', '12:00', 'no_show'),
      b('ATM', '2026-10-21', '07:00', '17:00', 'done', ['07:00', '17:00']),
      b('LAB', '2026-10-22', '12:00', '17:00', 'confirmed'),
      b('LAB', '2026-10-23', '07:00', '12:00', 'requested'),
    ];
    const u = resourceUsage({ resourceId: 'PIL', period: week, open, unavailable: [{ start: at('2026-10-23', '07:00'), end: at('2026-10-23', '17:00') }], bookings, rules: [rule] });
    expect(u).toEqual({ openHours: 50, netOpenHours: 40, bookedHours: 15, realisedHours: 8, realisedWithPrepHours: 9.5, blockedHours: 15, noShows: 1 });
    expect(rateOf(u.bookedHours, u.netOpenHours)).toBe(37.5);
    // A test over two days counts its opening hours only, never its night.
    const long: UsageBooking[] = [{ ...b('PIL', '2026-10-19', '07:00', '17:00', 'done', ['07:00', '17:00']), end: at('2026-10-20', '17:00'), actualEnd: at('2026-10-20', '17:00') }];
    const v = resourceUsage({ resourceId: 'PIL', period: week, open, unavailable: [], bookings: long, rules: [] });
    expect(v).toMatchObject({ bookedHours: 20, realisedWithPrepHours: 20, realisedHours: 18.5 });
    expect(rateOf(1, 0)).toBeNull();
  });

  it('waiting per entity and days used against a quota (A-3)', () => {
    const day = 86_400_000;
    expect(waitingByEntity([
      { entityCode: 'EPCFR', requestedAt: 0, start: 4 * day, status: 'done', late: true },
      { entityCode: 'EPCFR', requestedAt: 0, start: 10 * day, status: 'confirmed' },
      { entityCode: 'EPC2I', requestedAt: 0, start: 2 * day, status: 'cancelled', late: true },
    ])).toEqual([{ entityCode: 'EPCFR', count: 2, averageDays: 7, maxDays: 10, late: 1 }]);
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    expect(daysUsed([
      { start: at('2026-10-19', '07:00'), end: at('2026-10-20', '17:00'), status: 'confirmed' },
      { start: at('2026-10-20', '07:00'), end: at('2026-10-20', '12:00'), status: 'done' },
      { start: at('2026-10-21', '07:00'), end: at('2026-10-21', '12:00'), status: 'no_show' },
    ], iso)).toBe(2);
  });
});
