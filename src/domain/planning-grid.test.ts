import { describe, expect, it } from 'vitest';
import { parisInstant } from '@/lib/dates';
import { DEFAULT_HOURS } from './calendar';
import { weekGrid, type GridBooking } from './planning-grid';

const at = (iso: string, hhmm: string) => parisInstant(iso, hhmm).getTime();
const res = ['ATM', 'PIL', 'LAB'].map((code) => ({ id: code, code: `PDE-${code}`, facilityCode: 'PDE', status: 'in_service' }));
const cal = new Map([['PDE', { hours: DEFAULT_HOURS, closures: [{ fromOn: '2026-11-11', toOn: '2026-11-11', label: 'Armistice' }] }]]);
const b = (id: string, resourceId: string, day: string, from: string, to: string, status: GridBooking['status'] = 'confirmed'): GridBooking =>
  ({ id, resourceId, status, start: at(day, from), end: at(day, to) });

describe('week grid of the planning', () => {
  it('held, blocked by the PDE rule (P-2), requests shown without holding, closed days, unavailabilities', () => {
    const g = weekGrid({
      monday: '2026-11-09', resources: res, calendars: cal,
      bookings: [b('B1', 'PIL', '2026-11-09', '07:00', '17:00'), b('B2', 'LAB', '2026-11-10', '07:00', '12:00', 'requested')],
      unavailabilities: [{ resourceId: 'ATM', label: 'Lathe broken', start: at('2026-11-10', '00:00'), end: at('2026-11-11', '00:00') }],
      rules: [{ code: 'PDE-ONE-ZONE', maxActive: 1, resourceIds: ['ATM', 'PIL', 'LAB'] }],
    });
    const cell = (r: string, i: number) => g.get(r)![i];
    expect(g.get('PIL')).toHaveLength(10);
    expect(cell('PIL', 0)).toEqual({ day: '2026-11-09', half: 'am', state: 'held', bookingIds: ['B1'], reason: null });
    expect(cell('ATM', 0)).toMatchObject({ state: 'blocked', reason: 'PDE-ONE-ZONE · PDE-PIL' });
    expect(cell('LAB', 1)).toMatchObject({ state: 'blocked' });
    expect(cell('LAB', 2)).toMatchObject({ day: '2026-11-10', half: 'am', state: 'free', bookingIds: ['B2'] });
    expect(cell('ATM', 2)).toMatchObject({ state: 'unavailable', reason: 'Lathe broken' });
    expect(cell('PIL', 4)).toMatchObject({ day: '2026-11-11', state: 'closed' });
  });
});
