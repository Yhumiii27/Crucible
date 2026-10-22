// The business clock — settings, pinned and real dates, working days.
import { describe, expect, it } from 'vitest';
import { DEMO_CLOCK, DEMO_TODAY_ISO, REAL_CLOCK, addWorkdaysIso, businessNowOf, isIsoDate, lastWorkdayOf, parseClockSetting, todayOf } from './clock';

describe('business clock', () => {
  it('parses CRUCIBLE_CLOCK: "real" or a real calendar date', () => {
    expect(parseClockSetting('real')).toEqual(REAL_CLOCK);
    expect(parseClockSetting(' REAL ')).toEqual(REAL_CLOCK);
    expect(parseClockSetting(DEMO_TODAY_ISO)).toEqual(DEMO_CLOCK);
    expect(parseClockSetting('2026-02-30')).toBeNull();
    expect(parseClockSetting('25/09/2026')).toBeNull();
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
  });

  it('real clock: the Paris date of the instant (late evening UTC is already tomorrow in Paris)', () => {
    expect(todayOf(REAL_CLOCK, new Date('2026-10-16T09:00:00Z'))).toBe('2026-10-16');
    expect(todayOf(REAL_CLOCK, new Date('2026-10-16T22:30:00Z'))).toBe('2026-10-17');
  });

  it('pinned clock: the date is fixed, the time of day stays real (Paris)', () => {
    expect(todayOf(DEMO_CLOCK, new Date('2030-01-01T12:00:00Z'))).toBe(DEMO_TODAY_ISO);
    // 16 Oct 2026 11:42 in Paris (CEST) → 22 Oct 2026 11:42 Paris = 09:42Z.
    expect(businessNowOf(DEMO_CLOCK, new Date('2026-10-16T09:42:00Z')).toISOString()).toBe('2026-10-22T09:42:00.000Z');
  });

  it('working days: a weekend counts as its Friday; adding working days skips weekends', () => {
    expect(lastWorkdayOf('2026-10-24')).toBe('2026-10-23');
    expect(lastWorkdayOf('2026-10-25')).toBe('2026-10-23');
    // G1: two working days after Thursday 22 Oct → Monday 26 Oct.
    expect(addWorkdaysIso('2026-10-22', 2)).toBe('2026-10-26');
    expect(addWorkdaysIso('2026-10-23', 5)).toBe('2026-10-30');
  });
});
