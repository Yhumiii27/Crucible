// Incidents and replanning (docs/spec/03 §7, decisions A-8, F-4; delivery 5). After an incident — a breakdown of a resource,
// the absence of a person — or for an urgent test, Crucible: (1) finds the bookings touched; (2) computes a scenario that moves
// only them (the frozen window holds for every other booking), each placed again by the proposal engine — its resource first,
// then a validated substitute, with qualified people and its equipment —; (3) gives the consequences per project (date and
// working days late before and after). The same mechanism answers a what-if simulation. It never moves a booking: a person
// accepts the scenario. Pure.
import { addDaysIso, parisParts } from '@/lib/dates';
import type { BookingFacts } from './booking';
import { halfDays, overlaps, type Interval } from './calendar';
import { proposePlan, type EngineInput, type EngineNeed } from './engine';
import { workdaysBetween } from './priority';
import type { UnplacedReason } from './planning-vocabulary';

const isoOf = (ms: number) => parisParts(new Date(ms)).iso;

/** A booking the scenario may move: one that holds a resource and has not started. */
export interface MovableBooking extends BookingFacts {
  projectCode: string;
  needId: string | null;
  needRef: string | null;
  testTypeCode: string | null;
  /** Deadline of its need, or the last day of the booking when it serves none. */
  deadlineOn: string;
  facts: Pick<EngineNeed, 'priorityClass' | 'criticality' | 'requestedAt' | 'entityCode'>;
  staff: readonly { personId: string; skillCode: string }[];
  equipment: readonly string[];
}

export interface Move {
  bookingId: string;
  ref: string;
  projectCode: string;
  needRef: string | null;
  from: { resourceId: string; start: number; end: number };
  /** null: the booking cannot be placed again in the horizon. */
  to: { resourceId: string; start: number; end: number; substitute: boolean } | null;
  staff: { personId: string; skillCode: string }[];
  equipment: string[];
  reason: UnplacedReason | null;
}

export interface Impact {
  projectCode: string;
  ref: string;
  needRef: string | null;
  deadlineOn: string;
  beforeOn: string;
  afterOn: string | null;
  /** Working days after the deadline, before and after the scenario (null after: not placed). */
  lateBefore: number;
  lateAfter: number | null;
}

/** Bookings touched by an interval of time: on the resources given, or with a person given among their people. Not started only. */
export function touchedBookings(bookings: readonly MovableBooking[], window: Interval, by: { resourceIds?: readonly string[]; personId?: string }): MovableBooking[] {
  return bookings.filter((b) => b.status === 'confirmed' && overlaps(b, window)
    && ((by.resourceIds?.includes(b.resourceId) ?? false) || (!!by.personId && b.staff.some((s) => s.personId === by.personId))));
}

/** Open half-days of a booking on its resource's calendar (its length to place again). */
export function halfDaysOf(input: EngineInput, b: { resourceId: string; start: number; end: number }): number {
  const r = input.resources.find((x) => x.id === b.resourceId);
  const cal = r && input.calendars.get(r.facilityCode);
  if (!cal) return 1;
  let n = 0;
  for (let d = isoOf(b.start); d <= isoOf(b.end - 1); d = addDaysIso(d, 1)) {
    const h = halfDays(d, cal.hours, cal.closures);
    for (const x of [h?.am, h?.pm]) if (x && x.start >= b.start && x.end <= b.end) n++;
  }
  return Math.max(1, n);
}

/** The people and equipment of the bookings to move are free again (same interval, same person or equipment). */
const same = (a: Interval, b: Interval) => a.start === b.start && a.end === b.end;
const freeStaff = (busy: EngineInput['staffBusy'], moved: readonly MovableBooking[]) =>
  busy.filter((s) => !moved.some((b) => same(b, s) && b.staff.some((x) => x.personId === s.personId)));
const freeEquipment = (busy: EngineInput['equipmentBusy'], moved: readonly MovableBooking[]) =>
  busy.filter((e) => !moved.some((b) => same(b, e) && b.equipment.includes(e.code)));

const lateOf = (lastDay: string, deadlineOn: string) => (lastDay > deadlineOn ? workdaysBetween(addDaysIso(deadlineOn, 1), lastDay) : 0);

/**
 * Places again the bookings to move, from `earliestOn`, against every other booking (fixed) and what `input` holds (the incident
 * already in its unavailabilities or absences). Their people and equipment are freed first.
 */
export function replan(input: EngineInput, toMove: readonly MovableBooking[], earliestOn: string, extraFixed: readonly BookingFacts[] = []): { moves: Move[]; impacts: Impact[] } {
  const ids = new Set(toMove.map((b) => b.id));
  const scenarioInput: EngineInput = {
    ...input,
    fromOn: earliestOn > input.fromOn ? earliestOn : input.fromOn,
    bookings: [...input.bookings.filter((b) => !ids.has(b.id)), ...extraFixed],
    staffBusy: freeStaff(input.staffBusy, toMove),
    equipmentBusy: freeEquipment(input.equipmentBusy, toMove),
    needs: toMove.map((b) => ({
      id: b.id, ref: b.ref, projectCode: b.projectCode, resourceId: b.resourceId, testTypeCode: b.testTypeCode, remainingHalfDays: halfDaysOf(input, b),
      earliestOn, deadlineOn: b.deadlineOn > earliestOn ? b.deadlineOn : earliestOn, ...b.facts,
    })),
    precedences: [],
  };
  const r = proposePlan(scenarioInput);
  const moves: Move[] = toMove.map((b) => {
    const p = r.proposals.find((x) => x.needId === b.id);
    const u = r.unplaced.find((x) => x.needId === b.id);
    return {
      bookingId: b.id, ref: b.ref, projectCode: b.projectCode, needRef: b.needRef, from: { resourceId: b.resourceId, start: b.start, end: b.end },
      to: p ? { resourceId: p.resourceId, start: p.start, end: p.end, substitute: p.substitute } : null,
      staff: p?.staff ?? [], equipment: p?.equipment ?? [], reason: p ? null : u?.reason ?? 'no_slot',
    };
  });
  const impacts: Impact[] = toMove.map((b) => {
    const m = moves.find((x) => x.bookingId === b.id)!;
    const beforeOn = isoOf(b.end - 1);
    const afterOn = m.to ? isoOf(m.to.end - 1) : null;
    return {
      projectCode: b.projectCode, ref: b.ref, needRef: b.needRef, deadlineOn: b.deadlineOn, beforeOn, afterOn,
      lateBefore: lateOf(beforeOn, b.deadlineOn), lateAfter: afterOn ? lateOf(afterOn, b.deadlineOn) : null,
    };
  });
  return { moves, impacts };
}

/**
 * An urgent test (A-8): placed at the earliest, even inside the frozen window, as if the confirmed bookings not started were
 * not there; the ones it overlaps on its resource — or on a resource tied to it by a validated exclusion rule — are displaced
 * and placed again after it. Started and done tests are never displaced.
 */
export function urgencyPlan(input: EngineInput, urgent: EngineNeed, movable: readonly MovableBooking[], earliestOn: string): { slot: { resourceId: string; start: number; end: number; staff: { personId: string; skillCode: string }[]; equipment: string[] } | null; moves: Move[]; impacts: Impact[]; reason: UnplacedReason | null } {
  const confirmedIds = new Set(movable.map((b) => b.id));
  const first = proposePlan({
    ...input, fromOn: earliestOn, bookings: input.bookings.filter((b) => !confirmedIds.has(b.id)), needs: [{ ...urgent, earliestOn }], precedences: [],
    staffBusy: freeStaff(input.staffBusy, movable), equipmentBusy: freeEquipment(input.equipmentBusy, movable),
  });
  const p = first.proposals[0];
  if (!p) return { slot: null, moves: [], impacts: [], reason: first.unplaced[0]?.reason ?? 'no_slot' };
  const group = new Set([p.resourceId, ...input.rules.filter((r) => r.status === 'validated' && r.resourceIds.includes(p.resourceId)).flatMap((r) => r.resourceIds)]);
  const displaced = movable.filter((b) => overlaps(b, p) && (group.has(b.resourceId) || b.staff.some((s) => p.staff.some((x) => x.personId === s.personId)) || b.equipment.some((e) => p.equipment.includes(e))));
  const fixed: BookingFacts = { id: `urgent-${urgent.id}`, ref: urgent.ref, resourceId: p.resourceId, resourceCode: '', start: p.start, end: p.end, status: 'confirmed' };
  const withUrgent: EngineInput = {
    ...input,
    staffBusy: [...input.staffBusy, ...p.staff.map((s) => ({ personId: s.personId, start: p.start, end: p.end }))],
    equipmentBusy: [...input.equipmentBusy, ...p.equipment.map((code) => ({ code, start: p.start, end: p.end }))],
  };
  // Placed again after it: never before the day the urgent test ends.
  const urgentEnd = isoOf(p.end - 1);
  const { moves, impacts } = replan(withUrgent, displaced, urgentEnd > earliestOn ? urgentEnd : earliestOn, [fixed]);
  return { slot: { resourceId: p.resourceId, start: p.start, end: p.end, staff: p.staff, equipment: p.equipment }, moves, impacts, reason: null };
}
