// Priority rules (docs/spec/03 §5, decisions A-1, A-2, A-5): the order in which the engine serves the needs, and the rule that
// orders two of them in a conflict. The criteria order is a published version (priority_rule_sets); every comparison is
// deterministic — at equality on every criterion, the need reference decides, and a conflict says the tie is for a person.
// Pure.
import { addDaysIso, dowOfIso } from '@/lib/dates';
import type { MilestoneCriticality } from './needs';
import type { PriorityClass } from './organisation';
import { PRIORITY_CRITERIA, type PriorityCriterion } from './planning-vocabulary';

export interface PriorityFacts {
  id: string;
  ref: string;
  priorityClass: PriorityClass;
  /** Criticality of the milestone the need serves; null without milestone. */
  criticality: MilestoneCriticality | null;
  /** Half-days left to book. */
  remainingHalfDays: number;
  earliestOn: string;
  deadlineOn: string;
  /** Instant of the request (seniority). */
  requestedAt: number;
}

/** Working days (Monday–Friday) from `a` (included) to `b` (included); 0 when b < a. */
export function workdaysBetween(a: string, b: string): number {
  let n = 0;
  for (let d = a; d <= b; d = addDaysIso(d, 1)) {
    const w = dowOfIso(d);
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/** Margin of a need in working days: the working days left in its window minus the days of tests it still asks. */
export function slackOf(n: PriorityFacts, today: string): number {
  const from = n.earliestOn > today ? n.earliestOn : today;
  return workdaysBetween(from, n.deadlineOn) - Math.ceil(n.remainingHalfDays / 2);
}

/** Value of one criterion for a need: smaller is served first. */
export function criterionValue(c: PriorityCriterion, n: PriorityFacts, today: string): number {
  switch (c) {
    case 'safety_regulatory':
      return n.criticality === 'regulatory' ? 0 : 1;
    case 'contractual':
      return n.criticality === 'contractual' ? 0 : 1;
    case 'critical_milestone':
      return n.criticality && slackOf(n, today) <= 0 ? 0 : 1;
    case 'priority_class':
      return Number(n.priorityClass.slice(1));
    case 'slack':
      return slackOf(n, today);
    case 'seniority':
      return n.requestedAt;
  }
}

/** A need is critical when its milestone is regulatory or contractual, or when it has no margin left (spec 03 §4). */
export const isCritical = (n: PriorityFacts, today: string) => n.criticality === 'regulatory' || n.criticality === 'contractual' || (!!n.criticality && slackOf(n, today) <= 0);

/** Validates a criteria order: every criterion once. */
export function isCriteriaOrder(xs: readonly string[]): xs is PriorityCriterion[] {
  return xs.length === PRIORITY_CRITERIA.length && new Set(xs).size === xs.length && xs.every((x) => (PRIORITY_CRITERIA as readonly string[]).includes(x));
}

/** The first criterion of the order on which two needs differ, with its rank (1-based); null at equality on every criterion. */
export function decidingCriterion(a: PriorityFacts, b: PriorityFacts, order: readonly PriorityCriterion[], today: string): { criterion: PriorityCriterion; rank: number } | null {
  for (let i = 0; i < order.length; i++) {
    if (criterionValue(order[i], a, today) !== criterionValue(order[i], b, today)) return { criterion: order[i], rank: i + 1 };
  }
  return null;
}

/** Comparator of two needs under a criteria order (negative: `a` first). */
export function compareNeeds(a: PriorityFacts, b: PriorityFacts, order: readonly PriorityCriterion[], today: string): number {
  for (const c of order) {
    const d = criterionValue(c, a, today) - criterionValue(c, b, today);
    if (d !== 0) return d;
  }
  return a.ref.localeCompare(b.ref);
}

/**
 * The order in which the engine serves the needs: the criteria order, then the arbitrated precedences (a person decided that
 * `before` goes before `after`), applied in the order given.
 */
export function serviceOrder<T extends PriorityFacts>(needs: readonly T[], order: readonly PriorityCriterion[], today: string, precedences: readonly (readonly [string, string])[] = []): T[] {
  const out = [...needs].sort((a, b) => compareNeeds(a, b, order, today));
  for (const [before, after] of precedences) {
    const i = out.findIndex((n) => n.id === before);
    const j = out.findIndex((n) => n.id === after);
    if (i < 0 || j < 0 || i < j) continue;
    const [moved] = out.splice(i, 1);
    out.splice(j, 0, moved);
  }
  return out;
}
