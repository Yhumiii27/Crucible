import { describe, expect, it } from 'vitest';
import { checkMilestone, checkNeed, checkTestType, isLateRequest } from './needs';

const ctx = {
  resources: new Set(['r1']),
  milestones: new Map([['m1', { dueOn: '2026-12-21' }]]),
  testTypes: new Set(['FIRING']),
  today: '2026-10-22',
};

describe('needs', () => {
  it('a forecast without a deadline takes the date of its milestone (backward planning)', () => {
    const c = checkNeed({ level: 'forecast', title: 'Machining of the rig', resourceId: 'r1', halfDays: '8', milestoneId: 'm1', earliestOn: '2026-12-01' }, ctx);
    expect(c).toMatchObject({ ok: true, value: { deadlineOn: '2026-12-21', halfDays: 8, testTypeCode: null }, warnings: [] });
  });

  it('warns when the deadline comes after the milestone it serves', () => {
    const c = checkNeed({ level: 'request', title: 'Firing', resourceId: 'r1', halfDays: '2', milestoneId: 'm1', testTypeCode: 'firing', earliestOn: '2026-12-01', deadlineOn: '2027-01-08' }, ctx);
    expect(c).toMatchObject({ ok: true, value: { testTypeCode: 'FIRING' }, warnings: ['The deadline comes after the milestone'] });
  });

  it('refuses what cannot be planned', () => {
    const ok = { level: 'forecast', title: 'Tests', resourceId: 'r1', halfDays: '2', earliestOn: '2026-11-02', deadlineOn: '2026-11-20' };
    expect(checkNeed({ ...ok, resourceId: 'r2' }, ctx)).toEqual({ ok: false, error: 'Choose one of the resources' });
    expect(checkNeed({ ...ok, halfDays: '0' }, ctx)).toMatchObject({ ok: false });
    expect(checkNeed({ ...ok, halfDays: '1.5' }, ctx)).toMatchObject({ ok: false });
    expect(checkNeed({ ...ok, deadlineOn: '' }, ctx)).toEqual({ ok: false, error: 'Enter the deadline, or choose the milestone the tests serve' });
    expect(checkNeed({ ...ok, deadlineOn: '2026-10-30', earliestOn: '2026-11-02' }, ctx)).toEqual({ ok: false, error: 'The deadline comes before the earliest date' });
    expect(checkNeed({ ...ok, earliestOn: '2026-10-01', deadlineOn: '2026-10-20' }, ctx)).toEqual({ ok: false, error: 'The deadline has passed' });
    expect(checkNeed({ ...ok, milestoneId: 'm9' }, ctx)).toEqual({ ok: false, error: 'Choose a milestone of the project' });
    expect(checkNeed({ ...ok, testTypeCode: 'X' }, ctx)).toEqual({ ok: false, error: 'Choose a test type of the catalogue' });
  });

  it('a request made less than 10 working days before the test is late (F-5)', () => {
    expect(isLateRequest('2026-10-21', '2026-11-04', 10)).toBe(false);
    expect(isLateRequest('2026-10-21', '2026-11-03', 10)).toBe(true);
    expect(isLateRequest('2026-10-21', '2026-10-22', 0)).toBe(false);
  });

  it('milestones and test types', () => {
    expect(checkMilestone({ label: 'Design freeze', dueOn: '2026-11-20' })).toEqual({ ok: true, value: { label: 'Design freeze', dueOn: '2026-11-20', criticality: 'internal' } });
    expect(checkMilestone({ label: 'X', dueOn: '2026-11-20' })).toMatchObject({ ok: false });
    expect(checkMilestone({ label: 'Review', dueOn: '2026-11-20', criticality: 'urgent' })).toMatchObject({ ok: false });
    expect(checkTestType({ code: 'firing', name: 'Firing test', nominalResourceId: 'r1' }, { taken: new Set(), resources: new Set(['r1']) }))
      .toEqual({ ok: true, value: { code: 'FIRING', name: 'Firing test', nominalResourceId: 'r1', typicalHalfDays: 2, skills: null, description: null } });
    expect(checkTestType({ code: 'FIRING', name: 'Firing test' }, { taken: new Set(['FIRING']), resources: new Set() })).toEqual({ ok: false, error: 'This code is already used' });
  });
});
