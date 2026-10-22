// Proposal engine (docs/spec/03 §3–4, decisions T-3, F-2, F-3, F-7, R-4, R-8): a deterministic heuristic. It serves the open
// needs in the order of the priority rules (./priority.ts) and places each one at the earliest block of consecutive open
// half-days that passes every hard constraint — the booking checks of ./booking.ts (opening hours, state, unavailabilities,
// inspections, capacity, validated exclusion rules) against the bookings that hold a resource and the proposals already made,
// qualified people free and not absent (F-7), mobile equipment free (R-8) — first on its resource before its deadline, then on
// a VALIDATED substitute (never another one, R-4), then late, on the block that ends first. It never moves a booking: it only
// proposes (F-3). Same input, same proposals. Pure.
import { addDaysIso, parisParts } from '@/lib/dates';
import { checkBooking, type BookingFacts, type RuleFacts } from './booking';
import { halfDays, overlaps, type Closure, type Interval, type WeeklyHours } from './calendar';
import type { MilestoneCriticality } from './needs';
import type { PriorityClass } from './organisation';
import type { PriorityCriterion, UnplacedReason } from './planning-vocabulary';
import { criterionValue, isCritical, serviceOrder, workdaysBetween, type PriorityFacts } from './priority';
import type { Granularity, ResourceStatus } from './resources';

export interface EngineResource {
  id: string;
  code: string;
  facilityCode: string;
  capacity: number;
  status: ResourceStatus;
  granularity: Granularity;
}

export interface EngineNeed extends PriorityFacts {
  projectCode: string;
  entityCode: string;
  /** Resource the need asks (nominal). */
  resourceId: string;
  testTypeCode: string | null;
}

export interface EnginePerson {
  id: string;
  name: string;
  facilityCodes: readonly string[];
  skills: readonly { code: string; validUntil: string | null }[];
  absences: readonly { fromOn: string; toOn: string }[];
}

export interface EngineInput {
  today: string;
  /** Business instant: nothing is proposed before it. */
  now: number;
  /** First day a block may start, and the end of the horizon (excluded). */
  fromOn: string;
  toOn: string;
  resources: readonly EngineResource[];
  calendars: ReadonlyMap<string, { hours: readonly WeeklyHours[]; closures: readonly Closure[] }>;
  unavailabilities: readonly (Interval & { resourceId: string; label: string })[];
  inspections: readonly { resourceId: string; label: string; dueOn: string }[];
  /** Bookings that hold a resource (confirmed, started, done): fixed. */
  bookings: readonly BookingFacts[];
  /** Exclusion rules (validated ones forbid, proposed ones only warn). */
  rules: readonly RuleFacts[];
  needs: readonly EngineNeed[];
  people: readonly EnginePerson[];
  /** People and equipment already on the bookings that hold a resource. */
  staffBusy: readonly (Interval & { personId: string })[];
  equipmentBusy: readonly (Interval & { code: string })[];
  /** Skills (and how many people) and equipment each test type asks. */
  testTypes: ReadonlyMap<string, { skills: readonly { code: string; count: number }[]; equipment: readonly string[] }>;
  /** Validated substitutes of each test type: resource ids. */
  substitutes: ReadonlyMap<string, readonly string[]>;
  criteria: readonly PriorityCriterion[];
  /** Arbitrated precedences: [before, after] need ids. */
  precedences?: readonly (readonly [string, string])[];
}

export interface Proposal {
  needId: string;
  needRef: string;
  resourceId: string;
  start: number;
  end: number;
  substitute: boolean;
  /** Working days after the deadline. */
  lateDays: number;
  staff: { personId: string; skillCode: string }[];
  equipment: string[];
  /** Position in the service order (1 = served first) and the value of each criterion. */
  rank: number;
  criteria: Record<string, number>;
}

export interface EngineResult {
  order: string[];
  proposals: Proposal[];
  unplaced: { needId: string; needRef: string; reason: UnplacedReason }[];
}

const isoOf = (ms: number) => parisParts(new Date(ms)).iso;

/** Longest closed gap inside one test: a weekend and a bank holiday next to it. */
const MAX_GAP_MS = 4 * 86_400_000;

/** Open half-days of a resource from `fromOn` to `toOn` (excluded), in time order. */
function halfSlots(input: EngineInput, r: EngineResource, fromOn: string, toOn: string): Interval[] {
  const cal = input.calendars.get(r.facilityCode);
  if (!cal) return [];
  const out: Interval[] = [];
  for (let d = fromOn; d < toOn; d = addDaysIso(d, 1)) {
    const h = halfDays(d, cal.hours, cal.closures);
    if (h?.am) out.push(h.am);
    if (h?.pm) out.push(h.pm);
  }
  return out;
}

type Placed = Proposal;

/** People for a block: holding each skill asked, valid on the last day, in the facility, present, free. Deterministic (by name). */
function pickStaff(input: EngineInput, r: EngineResource, need: EngineNeed, block: Interval, placed: readonly Placed[]): { personId: string; skillCode: string }[] | null {
  const asked = need.testTypeCode ? input.testTypes.get(need.testTypeCode)?.skills ?? [] : [];
  if (!asked.length) return [];
  const first = isoOf(block.start);
  const last = isoOf(block.end - 1);
  const busy = [
    ...input.staffBusy,
    ...placed.flatMap((p) => p.staff.map((s) => ({ personId: s.personId, start: p.start, end: p.end }))),
  ];
  const chosen: { personId: string; skillCode: string }[] = [];
  const people = [...input.people].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const s of asked) {
    for (let k = 0; k < s.count; k++) {
      const p = people.find((x) =>
        !chosen.some((c) => c.personId === x.id)
        && x.facilityCodes.includes(r.facilityCode)
        && x.skills.some((y) => y.code === s.code && (y.validUntil == null || y.validUntil >= last))
        && !x.absences.some((a) => a.fromOn <= last && a.toOn >= first)
        && !busy.some((b) => b.personId === x.id && overlaps(b, block)));
      if (!p) return null;
      chosen.push({ personId: p.id, skillCode: s.code });
    }
  }
  return chosen;
}

function equipmentFree(input: EngineInput, need: EngineNeed, block: Interval, placed: readonly Placed[]): string[] | null {
  const asked = need.testTypeCode ? input.testTypes.get(need.testTypeCode)?.equipment ?? [] : [];
  const busy = [...input.equipmentBusy, ...placed.flatMap((p) => p.equipment.map((code) => ({ code, start: p.start, end: p.end })))];
  return asked.every((code) => !busy.some((b) => b.code === code && overlaps(b, block))) ? [...asked].sort() : null;
}

type Attempt = { ok: true; block: Interval; staff: { personId: string; skillCode: string }[]; equipment: string[] } | { ok: false; reasons: Set<UnplacedReason> };

/** The earliest feasible block of `n` half-days on a resource, optionally ending by a date. */
function earliestBlock(input: EngineInput, r: EngineResource, need: EngineNeed, n: number, placed: readonly Placed[], endBy: string | null): Attempt {
  const reasons = new Set<UnplacedReason>();
  if (r.status !== 'in_service') return { ok: false, reasons: new Set(['no_resource']) };
  const from = need.earliestOn > input.fromOn ? need.earliestOn : input.fromOn;
  const to = endBy && addDaysIso(endBy, 1) < input.toOn ? addDaysIso(endBy, 1) : input.toOn;
  const slots = halfSlots(input, r, from, to);
  const cal = input.calendars.get(r.facilityCode)!;
  const fixed: BookingFacts[] = [
    ...input.bookings,
    ...placed.map((p, i) => ({ id: `proposal-${i}`, ref: p.needRef, resourceId: p.resourceId, resourceCode: '', start: p.start, end: p.end, status: 'confirmed' as const })),
  ];
  for (let i = 0; i + n <= slots.length; i++) {
    const block = { start: slots[i].start, end: slots[i + n - 1].end };
    if (block.start < input.now) continue;
    // A test runs over consecutive open half-days: a weekend (and a bank holiday next to it) may fall inside, a shutdown may not.
    if (slots.slice(i, i + n - 1).some((s, k) => slots[i + k + 1].start - s.end > MAX_GAP_MS)) continue;
    const check = checkBooking(block, {
      resource: { id: r.id, code: r.code, status: r.status, capacity: r.capacity, granularity: 'half_day' },
      hours: cal.hours, closures: cal.closures,
      unavailabilities: input.unavailabilities.filter((u) => u.resourceId === r.id),
      inspections: input.inspections.filter((x) => x.resourceId === r.id),
      bookings: fixed, rules: input.rules, now: input.now, noticeWorkdays: null,
    });
    if (check.errors.length) {
      if (check.errors.every((e) => e.code === 'inspection_due')) reasons.add('inspection_due');
      else reasons.add('no_slot');
      continue;
    }
    const staff = pickStaff(input, r, need, block, placed);
    if (!staff) {
      reasons.add('no_staff');
      continue;
    }
    const equipment = equipmentFree(input, need, block, placed);
    if (!equipment) {
      reasons.add('no_equipment');
      continue;
    }
    return { ok: true, block, staff, equipment };
  }
  if (!reasons.size) reasons.add('no_slot');
  return { ok: false, reasons };
}

const REASON_ORDER: UnplacedReason[] = ['inspection_due', 'no_staff', 'no_equipment', 'no_slot', 'no_resource'];

export function proposePlan(input: EngineInput): EngineResult {
  const order = serviceOrder(input.needs.filter((n) => n.remainingHalfDays > 0), input.criteria, input.today, input.precedences ?? []);
  const byId = new Map(input.resources.map((r) => [r.id, r]));
  const placed: Placed[] = [];
  const unplaced: EngineResult['unplaced'] = [];
  order.forEach((need, idx) => {
    const nominal = byId.get(need.resourceId);
    const subs = (need.testTypeCode ? input.substitutes.get(need.testTypeCode) ?? [] : [])
      .filter((id) => id !== need.resourceId).map((id) => byId.get(id)).filter((r): r is EngineResource => !!r)
      .sort((a, b) => a.code.localeCompare(b.code));
    const candidates = [...(nominal ? [nominal] : []), ...subs];
    const reasons = new Set<UnplacedReason>();
    const n = need.remainingHalfDays;
    let found: { r: EngineResource; a: Extract<Attempt, { ok: true }> } | null = null;
    // On time: the nominal resource first, then a validated substitute.
    for (const r of candidates) {
      const a = earliestBlock(input, r, need, n, placed, need.deadlineOn);
      if (a.ok) {
        found = { r, a };
        break;
      }
      a.reasons.forEach((x) => reasons.add(x));
    }
    // Late: the block that ends first on any of them (the nominal resource at equality).
    if (!found) {
      for (const r of candidates) {
        const a = earliestBlock(input, r, need, n, placed, null);
        if (a.ok && (!found || a.block.end < found.a.block.end)) found = { r, a };
        if (!a.ok) a.reasons.forEach((x) => reasons.add(x));
      }
    }
    if (!found) {
      unplaced.push({ needId: need.id, needRef: need.ref, reason: candidates.length ? REASON_ORDER.find((x) => reasons.has(x)) ?? 'no_slot' : 'no_resource' });
      return;
    }
    const lastDay = isoOf(found.a.block.end - 1);
    placed.push({
      needId: need.id, needRef: need.ref, resourceId: found.r.id, start: found.a.block.start, end: found.a.block.end, substitute: found.r.id !== need.resourceId,
      lateDays: lastDay > need.deadlineOn ? workdaysBetween(addDaysIso(need.deadlineOn, 1), lastDay) : 0,
      staff: found.a.staff, equipment: found.a.equipment, rank: idx + 1,
      criteria: Object.fromEntries(input.criteria.map((c) => [c, criterionValue(c, need, input.today)])),
    });
  });
  return { order: order.map((n) => n.id), proposals: placed, unplaced };
}

/**
 * Score of a plan for the needs given, compared lexicographically (F-2; smaller is better): lateness of the critical needs
 * (an unplaced need counts as a full horizon late), lateness weighted by the priority class, then the number of substitutions
 * (the nominal resource first). Safety is not a score: every proposal already respects it.
 */
export function planScore(result: EngineResult, needs: readonly EngineNeed[], today: string): number[] {
  const UNPLACED = 130;
  let critical = 0;
  let weighted = 0;
  for (const n of needs) {
    const p = result.proposals.find((x) => x.needId === n.id);
    const late = p ? p.lateDays : result.unplaced.some((u) => u.needId === n.id) ? UNPLACED : 0;
    if (isCritical(n, today)) critical += late;
    weighted += late * (4 - Number(n.priorityClass.slice(1)));
  }
  return [critical, weighted, result.proposals.filter((p) => needs.some((n) => n.id === p.needId) && p.substitute).length];
}

export const compareScores = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};

export type { PriorityClass, MilestoneCriticality };
