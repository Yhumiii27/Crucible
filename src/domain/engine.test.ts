import { describe, expect, it } from 'vitest';
import { parisInstant, parisParts } from '@/lib/dates';
import { checkBooking, type BookingFacts, type RuleFacts } from './booking';
import { DEFAULT_HOURS, overlaps } from './calendar';
import { detectConflicts } from './conflicts';
import { proposePlan, traceNeed, type EngineInput, type EngineNeed, type EnginePerson, type EngineResource } from './engine';
import { PRIORITY_CRITERIA } from './planning-vocabulary';
import { compareNeeds, decidingCriterion, isCriteriaOrder, serviceOrder, slackOf } from './priority';

const at = (d: string, t: string) => parisInstant(d, t).getTime();
const iso = (ms: number) => parisParts(new Date(ms)).iso;
const res = (id: string, facilityCode = 'PDE'): EngineResource => ({ id, code: id, facilityCode, capacity: 1, status: 'in_service', granularity: 'half_day' });
const RULE: RuleFacts = { code: 'PDE-ONE-ZONE', maxActive: 1, status: 'validated', resourceIds: ['ATM', 'LAB', 'PIL'] };
const need = (o: Partial<EngineNeed> & Pick<EngineNeed, 'id' | 'resourceId' | 'remainingHalfDays' | 'earliestOn' | 'deadlineOn'>): EngineNeed => ({
  ref: o.id, projectCode: 'P', entityCode: 'EPC2I', priorityClass: 'P2', criticality: null, requestedAt: 0, testTypeCode: null, ...o,
});
const person = (id: string, skills: string[], extra: Partial<EnginePerson> = {}): EnginePerson =>
  ({ id, name: id, facilityCodes: ['PDE', 'LAB67'], skills: skills.map((code) => ({ code, validUntil: null })), absences: [], ...extra });

const base = (over: Partial<EngineInput> = {}): EngineInput => ({
  today: '2026-10-22', now: at('2026-10-22', '10:00'), fromOn: '2026-10-23', toOn: '2027-01-30',
  resources: [res('ATM'), res('LAB'), res('PIL'), res('ANA', 'LAB67')],
  calendars: new Map([
    ['PDE', { hours: DEFAULT_HOURS, closures: [{ fromOn: '2026-12-24', toOn: '2027-01-01', label: 'Shutdown' }] }],
    ['LAB67', { hours: DEFAULT_HOURS, closures: [{ fromOn: '2026-12-24', toOn: '2027-01-01', label: 'Shutdown' }] }],
  ]),
  unavailabilities: [], inspections: [], bookings: [], rules: [RULE], needs: [], people: [], staffBusy: [], equipmentBusy: [],
  testTypes: new Map(), substitutes: new Map(), criteria: [...PRIORITY_CRITERIA],
  ...over,
});

describe('priority rules (A-2)', () => {
  const reg = need({ id: 'CASS', resourceId: 'LAB', remainingHalfDays: 4, earliestOn: '2026-12-14', deadlineOn: '2026-12-18', criticality: 'regulatory', priorityClass: 'P1' });
  const vega = need({ id: 'VEGA', resourceId: 'ATM', remainingHalfDays: 8, earliestOn: '2026-12-14', deadlineOn: '2026-12-18', criticality: 'internal', priorityClass: 'P2' });
  it('a regulatory test goes first; the deciding criterion is cited with its rank', () => {
    expect(compareNeeds(reg, vega, PRIORITY_CRITERIA, '2026-10-22')).toBeLessThan(0);
    expect(decidingCriterion(reg, vega, PRIORITY_CRITERIA, '2026-10-22')).toEqual({ criterion: 'safety_regulatory', rank: 1 });
    expect(slackOf(vega, '2026-10-22')).toBe(1);
  });
  it('an arbitrated precedence overrides the rules; a criteria order is every criterion once', () => {
    expect(serviceOrder([vega, reg], PRIORITY_CRITERIA, '2026-10-22').map((n) => n.id)).toEqual(['CASS', 'VEGA']);
    expect(serviceOrder([vega, reg], PRIORITY_CRITERIA, '2026-10-22', [['VEGA', 'CASS']]).map((n) => n.id)).toEqual(['VEGA', 'CASS']);
    expect(isCriteriaOrder(['priority_class', 'safety_regulatory', 'contractual', 'critical_milestone', 'slack', 'seniority'])).toBe(true);
    expect(isCriteriaOrder(['priority_class', 'priority_class', 'contractual', 'critical_milestone', 'slack', 'seniority'])).toBe(false);
  });
});

describe('proposal engine', () => {
  it('places a need at the earliest free block of half-days, on time, with its people and equipment', () => {
    const r = proposePlan(base({
      needs: [need({ id: 'N1', resourceId: 'PIL', remainingHalfDays: 3, earliestOn: '2026-11-02', deadlineOn: '2026-11-13', testTypeCode: 'FIRING' })],
      testTypes: new Map([['FIRING', { skills: [{ code: 'PYRO', count: 1 }], equipment: ['CAM-01'] }]]),
      people: [person('Zoé', ['PYRO']), person('Ana', ['PYRO'])],
      bookings: [{ id: 'b', ref: 'B1', resourceId: 'ATM', resourceCode: 'ATM', start: at('2026-11-02', '07:00'), end: at('2026-11-02', '17:00'), status: 'confirmed' }],
    }));
    // 2 Nov is held by the workshop (one zone at a time): the pilot starts on the 3rd, morning to the next morning.
    expect(r.proposals).toEqual([expect.objectContaining({
      needId: 'N1', resourceId: 'PIL', start: at('2026-11-03', '07:00'), end: at('2026-11-04', '12:00'), lateDays: 0, substitute: false,
      staff: [{ personId: 'Ana', skillCode: 'PYRO' }], equipment: ['CAM-01'], rank: 1,
    })]);
  });

  it('a regulatory need is served first; the other is late, then the conflict sheet recommends the validated substitute', () => {
    const input = base({
      needs: [
        need({ id: 'VEGA', ref: 'N-2', resourceId: 'ATM', remainingHalfDays: 8, earliestOn: '2026-12-14', deadlineOn: '2026-12-18', criticality: 'internal' }),
        need({ id: 'CASS', ref: 'N-3', resourceId: 'LAB', remainingHalfDays: 4, earliestOn: '2026-12-14', deadlineOn: '2026-12-18', criticality: 'regulatory', priorityClass: 'P1', testTypeCode: 'FORMULATION' }),
      ],
      substitutes: new Map([['FORMULATION', ['ANA']]]),
    });
    const r = proposePlan(input);
    expect(r.order).toEqual(['CASS', 'VEGA']);
    const cass = r.proposals.find((p) => p.needId === 'CASS')!;
    const vega = r.proposals.find((p) => p.needId === 'VEGA')!;
    expect([cass.resourceId, iso(cass.start), iso(cass.end - 1)]).toEqual(['LAB', '2026-12-14', '2026-12-15']);
    expect([vega.resourceId, iso(vega.start), iso(vega.end - 1), vega.lateDays]).toEqual(['ATM', '2026-12-16', '2026-12-21', 1]);
    const [sheet] = detectConflicts(input, r, { resourceCode: (id) => id });
    expect(sheet).toMatchObject({ subject: 'PDE-ONE-ZONE', lateNeedId: 'VEGA', criterion: 'safety_regulatory', rank: 1, recommendedKey: 'N-2>N-3', critical: false });
    const best = sheet.options.find((o) => o.key === 'N-2>N-3')!;
    expect(best.orderRefs).toEqual(['N-2', 'N-3']);
    expect(best.outcomes.map((o) => [o.needRef, o.resourceId, o.lateDays, o.substitute])).toEqual([['N-2', 'ATM', 0, false], ['N-3', 'ANA', 0, true]]);
  });

  it('never proposes an unvalidated substitution, nor a resource with an inspection due (R-6, R-10)', () => {
    const r = proposePlan(base({
      needs: [need({ id: 'N1', resourceId: 'PIL', remainingHalfDays: 2, earliestOn: '2026-12-07', deadlineOn: '2026-12-18', testTypeCode: 'FIRING' })],
      inspections: [{ resourceId: 'PIL', label: 'Electrical check', dueOn: '2026-11-16' }],
      substitutes: new Map(),
    }));
    expect(r.proposals).toEqual([]);
    expect(r.unplaced).toEqual([{ needId: 'N1', needRef: 'N1', reason: 'inspection_due' }]);
  });

  it('without a qualified person present the need is not placed; an expired authorisation does not count', () => {
    const r = proposePlan(base({
      needs: [need({ id: 'N1', resourceId: 'PIL', remainingHalfDays: 2, earliestOn: '2026-11-02', deadlineOn: '2026-11-06', testTypeCode: 'FIRING' })],
      testTypes: new Map([['FIRING', { skills: [{ code: 'PYRO', count: 1 }], equipment: [] }]]),
      people: [person('Ana', [], { skills: [{ code: 'PYRO', validUntil: '2026-10-31' }] }), person('Léo', ['PYRO'], { absences: [{ fromOn: '2026-10-23', toOn: '2027-01-31' }] })],
      toOn: '2026-11-30',
    }));
    expect(r.unplaced).toEqual([{ needId: 'N1', needRef: 'N1', reason: 'no_staff' }]);
  });

  it('a test never spans the year-end shutdown', () => {
    const r = proposePlan(base({ needs: [need({ id: 'N1', resourceId: 'ANA', remainingHalfDays: 4, earliestOn: '2026-12-23', deadlineOn: '2027-01-15' })] }));
    expect(iso(r.proposals[0].start)).toBe('2027-01-04');
  });
});

/** Mulberry32: a small seeded generator, so that a failing case can be replayed. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('every proposal respects every hard constraint (property, 60 random scenarios)', () => {
  const days = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07'];
  for (let seed = 1; seed <= 60; seed++) {
    it(`scenario ${seed}`, () => {
      const r = rng(seed);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
      const resources = [res('ATM'), res('LAB'), res('PIL'), res('ANA', 'LAB67'), res('CLIM', 'LAB67')];
      const bookings: BookingFacts[] = Array.from({ length: Math.floor(r() * 6) }, (_, i) => {
        const d = pick(days);
        const rr = pick(resources);
        return { id: `b${i}`, ref: `B${i}`, resourceId: rr.id, resourceCode: rr.code, start: at(d, '07:00'), end: at(d, pick(['12:00', '17:00'])), status: 'confirmed' };
      });
      const people = [person('P1', ['PYRO']), person('P2', ['PYRO', 'MECA']), person('P3', ['MECA'], { absences: [{ fromOn: pick(days), toOn: pick(days) }] })];
      const needs: EngineNeed[] = Array.from({ length: 2 + Math.floor(r() * 7) }, (_, i) => {
        const from = pick(days);
        return need({
          id: `N${i}`, resourceId: pick(resources).id, remainingHalfDays: 1 + Math.floor(r() * 6), earliestOn: from, deadlineOn: pick(days.filter((d) => d >= from).concat(['2026-12-18'])),
          criticality: pick([null, 'internal', 'contractual', 'regulatory'] as const), priorityClass: pick(['P1', 'P2', 'P3'] as const),
          testTypeCode: pick([null, 'FIRING', 'MACH'] as const), requestedAt: i,
        });
      });
      const input = base({
        bookings, needs, people, toOn: '2027-01-15',
        unavailabilities: [{ resourceId: 'CLIM', start: at('2026-11-16', '00:00'), end: at('2026-11-19', '00:00'), label: 'Maintenance' }],
        testTypes: new Map([['FIRING', { skills: [{ code: 'PYRO', count: 1 }], equipment: ['CAM'] }], ['MACH', { skills: [{ code: 'MECA', count: 1 }], equipment: [] }]]),
        substitutes: new Map([['MACH', ['ANA']]]),
      });
      const out = proposePlan(input);
      expect(out.proposals.length + out.unplaced.length).toBe(needs.length);
      const asBookings = (except: number): BookingFacts[] => [
        ...bookings,
        ...out.proposals.filter((_, i) => i !== except).map((p, i) => ({ id: `p${i}`, ref: p.needRef, resourceId: p.resourceId, resourceCode: '', start: p.start, end: p.end, status: 'confirmed' as const })),
      ];
      out.proposals.forEach((p, i) => {
        const rr = resources.find((x) => x.id === p.resourceId)!;
        const n = needs.find((x) => x.id === p.needId)!;
        const cal = input.calendars.get(rr.facilityCode)!;
        // Hard constraints of the resource against the fixed bookings and every other proposal.
        const check = checkBooking(p, {
          resource: rr, hours: cal.hours, closures: cal.closures, unavailabilities: input.unavailabilities.filter((u) => u.resourceId === rr.id),
          inspections: [], bookings: asBookings(i), rules: input.rules, now: input.now, noticeWorkdays: null,
        });
        expect(check.errors).toEqual([]);
        // Its resource or a validated substitute of its test type, never before its earliest date.
        expect(p.resourceId === n.resourceId || (input.substitutes.get(n.testTypeCode ?? '') ?? []).includes(p.resourceId)).toBe(true);
        expect(iso(p.start) >= n.earliestOn).toBe(true);
        // People holding the skills, present, each on one test at a time; equipment on one test at a time.
        for (const s of p.staff) {
          const who = people.find((x) => x.id === s.personId)!;
          expect(who.skills.some((k) => k.code === s.skillCode)).toBe(true);
          expect(who.absences.some((a) => a.fromOn <= iso(p.end - 1) && a.toOn >= iso(p.start))).toBe(false);
        }
        out.proposals.forEach((q, j) => {
          if (j === i || !overlaps(p, q)) return;
          expect(p.staff.some((s) => q.staff.some((t) => t.personId === s.personId))).toBe(false);
          expect(p.equipment.some((e) => q.equipment.includes(e))).toBe(false);
        });
      });
    });
  }
});

describe('trace of a need (spec 04: why this slot and not an earlier one)', () => {
  it('the pilot waits for the workshop: refused on 2 Nov by the exclusion rule, which cites the booking', () => {
    const input = base({
      needs: [need({ id: 'N1', resourceId: 'PIL', remainingHalfDays: 3, earliestOn: '2026-11-02', deadlineOn: '2026-11-13' })],
      bookings: [{ id: 'b', ref: 'B1', resourceId: 'ATM', resourceCode: 'ATM', start: at('2026-11-02', '07:00'), end: at('2026-11-02', '17:00'), status: 'confirmed' }],
    });
    const r = proposePlan(input);
    const tr = traceNeed(input, r, 'N1')!;
    expect(tr).toMatchObject({ needRef: 'N1', rank: 1, servedBefore: [], unplacedReason: null, candidates: [{ id: 'PIL', code: 'PIL', substitute: false }] });
    expect(iso(tr.chosen!.start)).toBe('2026-11-03');
    expect(tr.steps.map((s) => [s.resourceCode, iso(s.from), iso(s.to), s.cause])).toEqual([
      ['PIL', '2026-11-02', '2026-11-02', { kind: 'issue', code: 'exclusion', ref: 'PDE-ONE-ZONE · ATM', by: ['B1'] }],
    ]);
  });

  it('a late need: the competitor served first holds the zone; the trace names it, its rank, and the missing skill elsewhere', () => {
    const input = base({
      needs: [
        need({ id: 'VEGA', ref: 'N-2', resourceId: 'ATM', remainingHalfDays: 8, earliestOn: '2026-12-14', deadlineOn: '2026-12-18' }),
        need({ id: 'CASS', ref: 'N-3', resourceId: 'LAB', remainingHalfDays: 4, earliestOn: '2026-12-14', deadlineOn: '2026-12-18', criticality: 'regulatory', priorityClass: 'P1' }),
      ],
    });
    const r = proposePlan(input);
    const tr = traceNeed(input, r, 'VEGA')!;
    expect(tr).toMatchObject({ rank: 2, servedBefore: ['N-3'], chosen: expect.objectContaining({ lateDays: 1 }) });
    // Mon 14 to Tue 15: the laboratory test (served first, regulatory) holds the building.
    expect(tr.steps.map((s) => [iso(s.from), iso(s.to), s.cause])).toEqual([
      ['2026-12-14', '2026-12-15', { kind: 'issue', code: 'exclusion', ref: 'PDE-ONE-ZONE · LAB', by: ['N-3'] }],
    ]);
    const staffed = base({
      needs: [need({ id: 'N9', resourceId: 'PIL', remainingHalfDays: 1, earliestOn: '2026-11-02', deadlineOn: '2026-11-03', testTypeCode: 'FIRING' })],
      testTypes: new Map([['FIRING', { skills: [{ code: 'PYRO', count: 1 }], equipment: [] }]]),
      people: [person('Ana', ['PYRO'], { absences: [{ fromOn: '2026-11-02', toOn: '2026-11-02' }] })],
    });
    const t2 = traceNeed(staffed, proposePlan(staffed), 'N9')!;
    expect(t2.steps.map((s) => [iso(s.from), iso(s.to), s.cause])).toEqual([['2026-11-02', '2026-11-02', { kind: 'staff', skillCode: 'PYRO' }]]);
    expect(iso(t2.chosen!.start)).toBe('2026-11-03');
    expect(traceNeed(staffed, proposePlan(staffed), 'nope')).toBeNull();
  });
});
