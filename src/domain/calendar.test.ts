import { describe, expect, it } from 'vitest';
import { parisInstant } from '@/lib/dates';
import {
  DEFAULT_HOURS, addMonthsIso, dayWindow, fitsOpening, halfDays, hoursOf, inspectionDueOn, intersect, isoWeekday, merge, mondayOf, openWindows, subtract,
} from './calendar';

const at = (iso: string, hhmm: string) => parisInstant(iso, hhmm).getTime();
const xmas = [{ fromOn: '2026-12-25', toOn: '2026-12-25', label: 'Christmas' }];

describe('opening calendar', () => {
  it('weekdays, Mondays and the default hours (R-9)', () => {
    expect(isoWeekday('2026-10-25')).toBe(7);
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(mondayOf('2026-10-22')).toBe('2026-10-19');
    expect(dayWindow('2026-10-22', DEFAULT_HOURS)).toEqual({ start: at('2026-10-22', '07:00'), end: at('2026-10-22', '17:00') });
    expect(dayWindow('2026-10-24', DEFAULT_HOURS)).toBeNull();
    expect(dayWindow('2026-12-25', DEFAULT_HOURS, xmas)).toBeNull();
  });

  it('half-days split at noon; the open windows of a week skip the weekend (and DST changes are followed)', () => {
    expect(halfDays('2026-10-26', DEFAULT_HOURS)).toEqual({
      am: { start: at('2026-10-26', '07:00'), end: at('2026-10-26', '12:00') },
      pm: { start: at('2026-10-26', '12:00'), end: at('2026-10-26', '17:00') },
    });
    const week = openWindows(DEFAULT_HOURS, [], '2026-10-19', '2026-10-26');
    expect(week).toHaveLength(5);
    expect(hoursOf(week)).toBe(50);
    expect(hoursOf(openWindows(DEFAULT_HOURS, [], '2026-10-24', '2026-10-27'))).toBe(10);
  });

  it('intervals: merge, intersect, subtract', () => {
    expect(merge([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 2, end: 6 }])).toEqual([{ start: 1, end: 8 }]);
    expect(intersect([{ start: 0, end: 10 }], [{ start: 2, end: 4 }, { start: 8, end: 12 }])).toEqual([{ start: 2, end: 4 }, { start: 8, end: 10 }]);
    expect(subtract([{ start: 0, end: 10 }], [{ start: 2, end: 4 }, { start: 8, end: 12 }])).toEqual([{ start: 0, end: 2 }, { start: 4, end: 8 }]);
  });

  it('a half-day slot must start and end on half-day boundaries; an hour slot inside opening hours', () => {
    const s = { start: at('2026-10-26', '07:00'), end: at('2026-10-27', '12:00') };
    expect(fitsOpening(s, '2026-10-26', '2026-10-27', DEFAULT_HOURS, [], true)).toBe(true);
    expect(fitsOpening({ start: at('2026-10-26', '09:00'), end: at('2026-10-26', '12:00') }, '2026-10-26', '2026-10-26', DEFAULT_HOURS, [], true)).toBe(false);
    expect(fitsOpening({ start: at('2026-10-26', '09:00'), end: at('2026-10-26', '11:30') }, '2026-10-26', '2026-10-26', DEFAULT_HOURS, [], false)).toBe(true);
    expect(fitsOpening({ start: at('2026-10-26', '06:00'), end: at('2026-10-26', '11:30') }, '2026-10-26', '2026-10-26', DEFAULT_HOURS, [], false)).toBe(false);
    expect(fitsOpening({ start: at('2026-12-25', '07:00'), end: at('2026-12-25', '12:00') }, '2026-12-25', '2026-12-25', DEFAULT_HOURS, xmas, true)).toBe(false);
  });

  it('months and inspection due dates (R-6)', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2025-11-15', 12)).toBe('2026-11-15');
    expect(inspectionDueOn('2026-05-10', 6)).toBe('2026-11-10');
  });
});
