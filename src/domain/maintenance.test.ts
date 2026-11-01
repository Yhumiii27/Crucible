import { describe, expect, it } from 'vitest';
import { checkPlan, checkRecord, maintenanceDueOn, maintenanceState } from './maintenance';

describe('maintenance and calibration plans (CR-073)', () => {
  it('due date from the last intervention and the period; state from the business date', () => {
    const p = { lastOn: '2025-11-10', periodMonths: 12 };
    expect(maintenanceDueOn(p)).toBe('2026-11-10');
    expect(maintenanceState(p, '2026-10-22')).toBe('ok');
    expect(maintenanceState(p, '2026-10-27')).toBe('soon');
    expect(maintenanceState(p, '2026-11-10')).toBe('soon');
    expect(maintenanceState(p, '2026-11-11')).toBe('overdue');
  });

  it('a plan and an intervention as typed', () => {
    expect(checkPlan({ kind: 'calibration', label: ' Load cell ', periodMonths: '12', lastOn: '2026-01-15', provider: '', blocking: 'on' }, '2026-10-22'))
      .toEqual({ ok: true, value: { kind: 'calibration', label: 'Load cell', periodMonths: 12, lastOn: '2026-01-15', provider: null, blocking: true } });
    expect(checkPlan({ kind: 'calibration', label: 'Load cell', periodMonths: '12', lastOn: '2026-01-15' }, '2026-10-22')).toMatchObject({ ok: true, value: { blocking: false } });
    expect(checkPlan({ kind: 'repair', label: 'x' }, '2026-10-22')).toEqual({ ok: false, error: 'Choose preventive maintenance or calibration' });
    expect(checkPlan({ kind: 'preventive', label: 'Oil', periodMonths: '0', lastOn: '2026-01-15' }, '2026-10-22')).toEqual({ ok: false, error: 'Period: 1 to 120 months' });
    expect(checkPlan({ kind: 'preventive', label: 'Oil', periodMonths: '6', lastOn: '2026-11-15' }, '2026-10-22').ok).toBe(false);
    expect(checkRecord({ doneOn: '2026-10-22', codexRef: ' CER-0042 ' }, '2026-10-22')).toEqual({ ok: true, value: { doneOn: '2026-10-22', provider: null, note: null, codexRef: 'CER-0042' } });
    expect(checkRecord({ doneOn: '2026-10-23' }, '2026-10-22').ok).toBe(false);
  });
});
