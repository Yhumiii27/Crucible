import { describe, expect, it } from 'vitest';
import { parisInstant, parisParts } from '@/lib/dates';
import { DEFAULT_HOURS } from './calendar';
import type { EngineInput } from './engine';
import { PRIORITY_CRITERIA } from './planning-vocabulary';
import { halfDaysOf, replan, touchedBookings, urgencyPlan, type MovableBooking } from './recovery';

const at = (d: string, t: string) => parisInstant(d, t).getTime();
const iso = (ms: number) => parisParts(new Date(ms)).iso;
const res = (id: string) => ({ id, code: id, facilityCode: 'PDE', capacity: 1, status: 'in_service' as const, granularity: 'half_day' as const });
const facts = { priorityClass: 'P2' as const, criticality: null, requestedAt: 0, entityCode: 'EPC2I' };
const booking = (id: string, resourceId: string, d: string, from = '07:00', to = '17:00', extra: Partial<MovableBooking> = {}): MovableBooking => ({
  id, ref: id, resourceId, resourceCode: resourceId, start: at(d, from), end: at(d, to), status: 'confirmed', projectCode: 'RD-ORION', needId: null, needRef: null,
  testTypeCode: null, deadlineOn: d, facts, staff: [], equipment: [], ...extra,
});
const base = (bookings: MovableBooking[], over: Partial<EngineInput> = {}): EngineInput => ({
  today: '2026-10-22', now: at('2026-10-22', '10:00'), fromOn: '2026-10-23', toOn: '2027-01-30',
  resources: [res('ATM'), res('LAB'), res('PIL')],
  calendars: new Map([['PDE', { hours: DEFAULT_HOURS, closures: [] }]]),
  unavailabilities: [], inspections: [], bookings, rules: [{ code: 'PDE-ONE-ZONE', maxActive: 1, status: 'validated', resourceIds: ['ATM', 'LAB', 'PIL'] }],
  needs: [], people: [], staffBusy: [], equipmentBusy: [], testTypes: new Map(), substitutes: new Map(), criteria: [...PRIORITY_CRITERIA],
  ...over,
});

describe('recovery after an incident (spec 03 §7)', () => {
  it('a breakdown of the pilot touches its confirmed tests only; the scenario moves them to the first free day, on time', () => {
    const b11 = booking('B-11', 'PIL', '2026-10-27', '07:00', '17:00', { deadlineOn: '2026-10-30', needRef: 'N-4' });
    const other = booking('B-12', 'ATM', '2026-10-28', '07:00', '12:00');
    const started = { ...booking('B-13', 'PIL', '2026-10-26'), status: 'in_progress' as const };
    const breakdown = { start: at('2026-10-26', '00:00'), end: at('2026-10-29', '00:00') };
    const touched = touchedBookings([b11, other, started], breakdown, { resourceIds: ['PIL'] });
    expect(touched.map((b) => b.id)).toEqual(['B-11']);
    const input = base([b11, other], { unavailabilities: [{ resourceId: 'PIL', label: 'Breakdown', ...breakdown }] });
    expect(halfDaysOf(input, b11)).toBe(2);
    const { moves, impacts } = replan(input, touched, '2026-10-26');
    expect(moves).toEqual([expect.objectContaining({ bookingId: 'B-11', reason: null, to: { resourceId: 'PIL', start: at('2026-10-29', '07:00'), end: at('2026-10-29', '17:00'), substitute: false } })]);
    expect(impacts).toEqual([{ projectCode: 'RD-ORION', ref: 'B-11', needRef: 'N-4', deadlineOn: '2026-10-30', beforeOn: '2026-10-27', afterOn: '2026-10-29', lateBefore: 0, lateAfter: 0 }]);
  });

  it('an absence touches the tests of the person; without another qualified person the test is late or not placed', () => {
    const b = booking('B-20', 'PIL', '2026-11-03', '07:00', '17:00', { staff: [{ personId: 'P1', skillCode: 'PYRO' }], testTypeCode: 'FIRING', deadlineOn: '2026-11-06' });
    const touched = touchedBookings([b], { start: at('2026-11-02', '00:00'), end: at('2026-11-07', '00:00') }, { personId: 'P1' });
    expect(touched).toHaveLength(1);
    const input = base([b], {
      toOn: '2026-11-30',
      testTypes: new Map([['FIRING', { skills: [{ code: 'PYRO', count: 1 }], equipment: [] }]]),
      people: [{ id: 'P1', name: 'P1', facilityCodes: ['PDE'], skills: [{ code: 'PYRO', validUntil: null }], absences: [{ fromOn: '2026-11-02', toOn: '2026-11-06' }] }],
      staffBusy: [{ personId: 'P1', start: b.start, end: b.end }],
    });
    const { moves, impacts } = replan(input, touched, '2026-11-02');
    expect(iso(moves[0].to!.start)).toBe('2026-11-09');
    expect(moves[0].staff).toEqual([{ personId: 'P1', skillCode: 'PYRO' }]);
    expect(impacts[0]).toMatchObject({ lateBefore: 0, lateAfter: 1 });
  });

  it('an urgent test goes first, even on a confirmed slot; the bookings it overlaps in the PDE are placed again after it (A-8)', () => {
    const lab = booking('B-30', 'LAB', '2026-10-26', '07:00', '17:00', { deadlineOn: '2026-11-13' });
    const input = base([lab]);
    const urgent = { id: 'U', ref: 'N-9', projectCode: 'RD-VEGA', resourceId: 'PIL', testTypeCode: null, remainingHalfDays: 2, earliestOn: '2026-10-23', deadlineOn: '2026-10-26', ...facts };
    const r = urgencyPlan(input, urgent, [lab], '2026-10-26');
    expect(r.slot).toMatchObject({ resourceId: 'PIL', start: at('2026-10-26', '07:00'), end: at('2026-10-26', '17:00') });
    expect(r.moves.map((m) => [m.ref, iso(m.to!.start)])).toEqual([['B-30', '2026-10-27']]);
    expect(r.impacts[0]).toMatchObject({ lateBefore: 0, lateAfter: 0 });
  });
});
