import { describe, expect, it } from 'vitest';
import { checkPilotSettings, parsePilotSettings, pilotPeriods, pilotStatus, pointsDelta, readiness, type PilotSettings } from './pilot';

const S: PilotSettings = { startOn: '2026-11-02', weeks: 4, facilities: ['LAB67', 'PDE'], baselineWeeks: 13 };
const ctx = { facilities: new Set(['LAB67', 'PDE']), today: '2026-10-23' };

describe('the pilot (X-2: reference before, pilot after)', () => {
  it('status: not set, planned, the week it is in, ended', () => {
    expect(pilotStatus(null, '2026-10-23')).toEqual({ kind: 'not_set' });
    expect(pilotStatus(S, '2026-10-23')).toEqual({ kind: 'planned', daysLeft: 10 });
    expect(pilotStatus(S, '2026-11-02')).toEqual({ kind: 'running', week: 1, of: 4 });
    expect(pilotStatus(S, '2026-11-29')).toEqual({ kind: 'running', week: 4, of: 4 });
    expect(pilotStatus(S, '2026-11-30')).toEqual({ kind: 'ended', endOn: '2026-11-30' });
  });

  it('periods: 13 weeks before the start; the pilot to today included, never after its end', () => {
    expect(pilotPeriods(S, '2026-10-23')).toEqual({ baseline: { from: '2026-08-03', to: '2026-11-02' }, pilot: null });
    expect(pilotPeriods(S, '2026-11-10').pilot).toEqual({ from: '2026-11-02', to: '2026-11-11' });
    expect(pilotPeriods(S, '2027-01-15').pilot).toEqual({ from: '2026-11-02', to: '2026-11-30' });
    expect(pointsDelta(31.2, 38)).toBe(6.8);
    expect(pointsDelta(null, 38)).toBeNull();
  });

  it('settings: a start, 1 to 26 weeks, active facilities; stored values read back', () => {
    expect(checkPilotSettings({ startOn: '2026-11-02', facilities: ['pde', 'LAB67', 'PDE'] }, ctx)).toEqual({ ok: true, value: S });
    expect(checkPilotSettings({ startOn: '', facilities: ['PDE'] }, ctx)).toEqual({ ok: false, error: 'Enter the first day of the pilot' });
    expect(checkPilotSettings({ startOn: '2026-11-02', weeks: '30', facilities: ['PDE'] }, ctx)).toEqual({ ok: false, error: 'The pilot lasts 1 to 26 weeks' });
    expect(checkPilotSettings({ startOn: '2026-11-02', facilities: [] }, ctx)).toEqual({ ok: false, error: 'Choose the facilities of the pilot' });
    expect(checkPilotSettings({ startOn: '2026-11-02', facilities: ['ATELIER'] }, ctx)).toEqual({ ok: false, error: 'Choose active facilities' });
    expect(parsePilotSettings(S)).toEqual(S);
    expect(parsePilotSettings({ startOn: 'x' })).toBeNull();
  });

  it('readiness: what is missing, per facility or overall', () => {
    const items = readiness({
      facilities: [{ code: 'PDE', resources: 3, managers: 1, technicians: 1, rules: 1, inspections: 1 }, { code: 'LAB67', resources: 3, managers: 1, technicians: 0, rules: 0, inspections: 0 }],
      coordinators: 1, safetyOfficers: 1, peopleWithSkills: 4, projectsWithMilestones: 2, historyBookings: 0, entra: false,
    });
    expect(items.filter((i) => !i.ok).map((i) => [i.key, i.missing])).toEqual([['inspections', ['LAB67']], ['technicians', ['LAB67']], ['history', []], ['auth', []]]);
  });
});
