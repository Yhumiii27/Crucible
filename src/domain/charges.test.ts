// Pure rules of the internal chargeback (CR-074, X-19): the rate in force for an entity, the hours billed, the statement.
import { describe, expect, it } from 'vitest';
import { billedHours, chargeLine, chargeStatement, checkRate, euros, rateFor, type ChargeBooking, type ChargeRate } from './charges';

const H = 3_600_000;
const T0 = Date.parse('2026-10-05T07:00:00Z');
const rate = (o: Partial<ChargeRate>): ChargeRate => ({ id: 'r', resourceId: 'R1', entityCode: null, centsPerHour: 8000, validFrom: '2026-01-01', createdAt: 0, ...o });
const booking = (o: Partial<ChargeBooking>): ChargeBooking => ({
  id: 'b', ref: 'B-1', resourceId: 'R1', resourceCode: 'LAB-1', facilityCode: 'LAB67', entityCode: 'EPC2I', projectCode: 'RD-ORION', confidential: false,
  status: 'done', start: T0, end: T0 + 8 * H, actualStart: T0 + 0.5 * H, actualEnd: T0 + 6.5 * H, day: '2026-10-05', ...o,
});

describe('rateFor', () => {
  const rates = [
    rate({ id: 'all-2026', validFrom: '2026-01-01', centsPerHour: 8000 }),
    rate({ id: 'all-oct', validFrom: '2026-10-01', centsPerHour: 9000 }),
    rate({ id: 'epcfr', entityCode: 'EPCFR', validFrom: '2026-06-01', centsPerHour: 12000 }),
    rate({ id: 'other', resourceId: 'R2', validFrom: '2025-01-01' }),
  ];
  it('the entity’s own rate first, else every entity’s; the latest first day not after the booking', () => {
    expect(rateFor(rates, 'R1', 'EPC2I', '2026-09-30')?.id).toBe('all-2026');
    expect(rateFor(rates, 'R1', 'EPC2I', '2026-10-05')?.id).toBe('all-oct');
    expect(rateFor(rates, 'R1', 'EPCFR', '2026-10-05')?.id).toBe('epcfr');
    expect(rateFor(rates, 'R1', 'EPCFR', '2026-05-31')?.id).toBe('all-2026');
    expect(rateFor(rates, 'R1', 'EPC2I', '2025-12-31')).toBeNull();
  });
});

describe('billedHours', () => {
  it('realised for a test done (booked when not recorded), booked for one not held, nothing otherwise', () => {
    expect(billedHours(booking({}))).toBe(6);
    expect(billedHours(booking({ actualStart: null, actualEnd: null }))).toBe(8);
    expect(billedHours(booking({ status: 'no_show' }))).toBe(8);
    for (const status of ['confirmed', 'in_progress', 'cancelled', 'requested']) expect(billedHours(booking({ status }))).toBe(0);
  });
});

describe('chargeStatement', () => {
  const rates = [rate({ centsPerHour: 8550 })];
  it('one group per entity and project, hidden projects together; amounts and lines without a rate', () => {
    const lines = [
      chargeLine(booking({ id: '1', ref: 'B-1' }), rates),
      chargeLine(booking({ id: '2', ref: 'B-2', status: 'no_show', start: T0, end: T0 + 4 * H, actualStart: null, actualEnd: null }), rates),
      chargeLine(booking({ id: '3', ref: 'B-3', projectCode: null, confidential: true }), rates),
      chargeLine(booking({ id: '4', ref: 'B-4', entityCode: 'EPCFR', projectCode: 'FR-1', resourceId: 'R9' }), rates),
      chargeLine(booking({ id: '5', ref: 'B-5', status: 'confirmed' }), rates),
    ];
    expect(lines[0]).toMatchObject({ bookedHours: 8, realisedHours: 6, billedHours: 6, centsPerHour: 8550, amountCents: 51300 });
    const s = chargeStatement(lines);
    expect(s.groups.map((g) => [g.entityCode, g.projectCode, g.lines.length, g.billedHours, g.amountCents, g.unrated])).toEqual([
      ['EPC2I', 'RD-ORION', 3, 10, 85500, 0],
      ['EPC2I', null, 1, 6, 51300, 0],
      ['EPCFR', 'FR-1', 1, 6, 0, 1],
    ]);
    expect(s.amountCents).toBe(136800);
    expect(s.unrated).toBe(1);
    expect(euros(s.amountCents)).toBe(1368);
  });
});

describe('checkRate', () => {
  const ents = new Set(['EPC2I', 'EPCFR']);
  it('euros per hour with a comma or a dot, a first day, an entity or every one', () => {
    expect(checkRate({ eurPerHour: '85,50', validFrom: '2026-11-01', entityCode: '' }, ents)).toEqual({ ok: true, value: { centsPerHour: 8550, validFrom: '2026-11-01', entityCode: null } });
    expect(checkRate({ eurPerHour: '1 200', validFrom: '2026-11-01', entityCode: 'EPCFR' }, ents)).toEqual({ ok: true, value: { centsPerHour: 120000, validFrom: '2026-11-01', entityCode: 'EPCFR' } });
    expect(checkRate({ eurPerHour: '-5', validFrom: '2026-11-01', entityCode: '' }, ents)).toMatchObject({ ok: false });
    expect(checkRate({ eurPerHour: '85.555', validFrom: '2026-11-01', entityCode: '' }, ents)).toMatchObject({ ok: false });
    expect(checkRate({ eurPerHour: '85', validFrom: 'soon', entityCode: '' }, ents)).toEqual({ ok: false, error: 'Enter the first day of the rate' });
    expect(checkRate({ eurPerHour: '85', validFrom: '2026-11-01', entityCode: 'ACME' }, ents)).toEqual({ ok: false, error: 'Choose an entity' });
  });
});
