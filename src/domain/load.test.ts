import { describe, expect, it } from 'vitest';
import { parisInstant } from '@/lib/dates';
import { DEFAULT_HOURS } from './calendar';
import { byQuarter, halfDayHours, loadForecast, loadSignals, quarterOf, type LoadInput } from './load';

const at = (d: string, t: string) => parisInstant(d, t).getTime();
const PDE = ['ATM', 'LAB', 'PIL'].map((z) => ({ id: z, code: `PDE-${z}`, facilityCode: 'PDE', capacity: 1 }));
const RULE = { code: 'PDE-ONE-ZONE', maxActive: 1, resourceIds: ['ATM', 'LAB', 'PIL'] };
const base = (over: Partial<LoadInput> = {}): LoadInput => ({
  weeks: ['2026-12-07', '2026-12-14', '2026-12-21'],
  today: '2026-10-22',
  resources: PDE,
  calendars: new Map([['PDE', { hours: DEFAULT_HOURS, closures: [{ fromOn: '2026-12-24', toOn: '2027-01-01', label: 'Shutdown' }] }]]),
  unavailabilities: [],
  bookings: [],
  needs: [],
  rules: [RULE],
  ...over,
});
const need = (id: string, resourceId: string, halfDays: number, earliestOn: string, deadlineOn: string, level: 'forecast' | 'request' = 'forecast') =>
  ({ id, ref: id, projectCode: 'P', resourceId, level, halfDays, earliestOn, deadlineOn });

describe('load forecast', () => {
  it('half a typical day of 07:00–17:00 is 5 hours', () => {
    expect(halfDayHours(DEFAULT_HOURS)).toBe(5);
    expect(halfDayHours([])).toBe(5);
  });

  it('net capacity: 5 days × 10 h, the closure of 24 Dec on removes the end of the third week', () => {
    const f = loadForecast(base());
    expect(f.byResource.get('PIL')!.map((w) => w.capacityHours)).toEqual([50, 50, 30]);
    expect(f.byRule.get('PDE-ONE-ZONE')!.map((w) => w.capacityHours)).toEqual([50, 50, 30]);
  });

  it('a forecast is spread over the net open hours of its window; the PDE zones add up against one zone (P-2)', () => {
    const f = loadForecast(base({
      needs: [need('N1', 'PIL', 12, '2026-12-07', '2026-12-18'), need('N2', 'ATM', 8, '2026-12-14', '2026-12-18'), need('N3', 'LAB', 4, '2026-12-14', '2026-12-18')],
    }));
    expect(f.byResource.get('PIL')!.map((w) => w.forecastHours)).toEqual([30, 30, 0]);
    expect(f.byResource.get('ATM')![1]).toMatchObject({ forecastHours: 40, loadHours: 40, ratio: 0.8 });
    expect(f.byRule.get('PDE-ONE-ZONE')![1]).toMatchObject({ loadHours: 90, capacityHours: 50, ratio: 1.8 });
    const signals = loadSignals(f, { resources: PDE, rules: [RULE] }, '2026-10-22');
    expect(signals.filter((s) => s.kind === 'bottleneck')).toEqual([{ kind: 'bottleneck', subject: 'PDE-ONE-ZONE', monday: '2026-12-14', ratio: 1.8, weeksAhead: 8 }]);
  });

  it('bookings hold the resource, requests are load too; a need is reduced by its linked bookings', () => {
    const f = loadForecast(base({
      bookings: [
        { resourceId: 'PIL', start: at('2026-12-07', '07:00'), end: at('2026-12-07', '17:00'), status: 'confirmed', needId: 'N1' },
        { resourceId: 'PIL', start: at('2026-12-08', '07:00'), end: at('2026-12-08', '12:00'), status: 'requested', needId: null },
        { resourceId: 'PIL', start: at('2026-12-09', '07:00'), end: at('2026-12-09', '17:00'), status: 'cancelled', needId: 'N1' },
      ],
      needs: [need('N1', 'PIL', 4, '2026-12-07', '2026-12-11', 'request')],
    }));
    expect(f.byResource.get('PIL')![0]).toMatchObject({ bookedHours: 10, requestedHours: 5, requestHours: 10, loadHours: 25, ratio: 0.5 });
    expect(f.needs).toEqual([{ id: 'N1', ref: 'N1', askedHours: 20, coveredHours: 10, remainingHours: 10, remainingHalfDays: 2, overdue: false }]);
  });

  it('an unavailability lowers the capacity and the room of the needs', () => {
    const f = loadForecast(base({
      unavailabilities: [{ resourceId: 'PIL', start: at('2026-12-07', '00:00'), end: at('2026-12-09', '00:00') }],
      needs: [need('N1', 'PIL', 6, '2026-12-07', '2026-12-11')],
    }));
    expect(f.byResource.get('PIL')![0]).toMatchObject({ capacityHours: 30, forecastHours: 30, ratio: 1 });
  });

  it('a need whose deadline has passed puts its remainder in the current week, flagged overdue', () => {
    const f = loadForecast(base({ weeks: ['2026-10-19', '2026-10-26'], needs: [need('N1', 'PIL', 2, '2026-10-12', '2026-10-16')] }));
    expect(f.byResource.get('PIL')![0].forecastHours).toBe(10);
    expect(f.needs[0].overdue).toBe(true);
  });

  it('only the weeks of the horizon receive their share of a long window', () => {
    const f = loadForecast(base({ weeks: ['2026-12-07'], needs: [need('N1', 'PIL', 20, '2026-12-07', '2026-12-18')] }));
    expect(f.byResource.get('PIL')![0].forecastHours).toBe(50);
  });

  it('gaps: weeks of the next quarter under 30 %, judged on the rule for the zones it ties', () => {
    const f = loadForecast(base({ weeks: ['2026-10-19', '2026-10-26'], resources: [...PDE, { id: 'TRAC', code: 'LAB67-TRAC', facilityCode: 'PDE', capacity: 1 }] }));
    const gaps = loadSignals(f, { resources: [...PDE, { id: 'TRAC', code: 'LAB67-TRAC', facilityCode: 'PDE', capacity: 1 }], rules: [RULE] }, '2026-10-22');
    expect(gaps.map((g) => `${g.subject} ${g.monday}`)).toEqual(['LAB67-TRAC 2026-10-19', 'PDE-ONE-ZONE 2026-10-19', 'LAB67-TRAC 2026-10-26', 'PDE-ONE-ZONE 2026-10-26']);
  });

  it('quarters of the 12-month envelopes', () => {
    expect(quarterOf('2026-12-28')).toBe('2026-T4');
    expect(quarterOf('2027-01-04')).toBe('2027-T1');
    const f = loadForecast(base({ needs: [need('N1', 'PIL', 12, '2026-12-07', '2026-12-18')] }));
    expect(byQuarter(f.byResource.get('PIL')!)).toEqual([{ quarter: '2026-T4', capacityHours: 130, loadHours: 60, ratio: 0.46 }]);
  });
});
