import { describe, expect, it } from 'vitest';
import { monthRange, parseMonth, reportLine, shiftMonth, totalLine } from './report';

const u = (o: Partial<{ openHours: number; netOpenHours: number; bookedHours: number; realisedHours: number; realisedWithPrepHours: number; blockedHours: number; noShows: number }>) =>
  ({ openHours: 0, netOpenHours: 0, bookedHours: 0, realisedHours: 0, realisedWithPrepHours: 0, blockedHours: 0, noShows: 0, ...o });

describe('monthly report (CR-077)', () => {
  it('months typed in the address, their range, the months around', () => {
    expect(parseMonth('2026-10')).toBe('2026-10');
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth(['2026-10'])).toBeNull();
    expect(monthRange('2026-12')).toEqual({ fromIso: '2026-12-01', toIso: '2027-01-01' });
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('a line in hours and rates; a total adds the hours before computing its rates', () => {
    const a = u({ netOpenHours: 100, bookedHours: 50, realisedWithPrepHours: 40.04, blockedHours: 10, noShows: 1 });
    const b = u({ netOpenHours: 100, bookedHours: 0 });
    expect(reportLine('PDE-PIL', 'PDE', a)).toEqual({
      code: 'PDE-PIL', facilityCode: 'PDE', netOpenHours: 100, bookedHours: 50, realisedHours: 40, blockedHours: 10, noShows: 1, bookedRate: 50, realisedRate: 40, blockedRate: 10,
    });
    expect(totalLine('PDE', 'PDE', [a, b])).toMatchObject({ netOpenHours: 200, bookedHours: 50, bookedRate: 25, noShows: 1 });
    expect(reportLine('X', 'Y', u({})).bookedRate).toBeNull();
  });
});
