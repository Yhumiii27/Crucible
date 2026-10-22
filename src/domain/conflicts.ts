// Conflict sheets (docs/spec/03 §5, decisions A-2, A-4, A-6): when the engine places a need late, or cannot place it, because
// needs served before it hold its resource — or a resource tied to it by a validated exclusion rule (P-2) — in its window, the
// engine does not decide: it writes a sheet. The options are "as proposed" and, for each competitor, "this need first" (the
// engine run again with that precedence); each option gives the consequences for every need involved (slot, resource,
// substitute, working days late). The recommendation is the best option under the order of the objectives (F-2), the rule cited
// is the priority criterion that put the competitor first, the decider is the coordinator unless an option leaves a critical
// need late (then the R&D director, A-4). Pure.
import { parisParts } from '@/lib/dates';
import { addWorkdaysIso } from './clock';
import type { RuleFacts } from './booking';
import { compareScores, planScore, proposePlan, type EngineInput, type EngineNeed, type EngineResult } from './engine';
import { decidingCriterion, isCritical } from './priority';
import type { PriorityCriterion } from './planning-vocabulary';

export interface OptionOutcome {
  needId: string;
  needRef: string;
  resourceId: string | null;
  start: number | null;
  end: number | null;
  substitute: boolean;
  /** Working days late; null when the need is not placed. */
  lateDays: number | null;
}

export interface ConflictOption {
  key: string;
  /** Need refs in the order this option serves them. */
  orderRefs: string[];
  order: string[];
  outcomes: OptionOutcome[];
  score: number[];
}

export interface ConflictSheet {
  /** Sorted ids of the needs involved. */
  needIds: string[];
  /** The need that is late or not placed. */
  lateNeedId: string;
  /** Exclusion rule code, or resource code, where they compete. */
  subject: string;
  options: ConflictOption[];
  recommendedKey: string;
  criterion: PriorityCriterion | null;
  rank: number | null;
  /** An option leaves a critical need late (A-4: the R&D director decides). */
  critical: boolean;
}

const dayOf = (ms: number) => parisParts(new Date(ms)).iso;

function outcomesOf(r: EngineResult, needs: readonly EngineNeed[]): OptionOutcome[] {
  return needs.map((n) => {
    const p = r.proposals.find((x) => x.needId === n.id);
    return {
      needId: n.id, needRef: n.ref, resourceId: p?.resourceId ?? null, start: p?.start ?? null, end: p?.end ?? null,
      substitute: p?.substitute ?? false, lateDays: p ? p.lateDays : null,
    };
  });
}

/** Conflicts of a run: one sheet per late or unplaced need that competitors served before it push out of its window. */
export function detectConflicts(input: EngineInput, result: EngineResult, codes: { resourceCode: (id: string) => string }): ConflictSheet[] {
  const validated: RuleFacts[] = input.rules.filter((r) => r.status === 'validated');
  const needById = new Map(input.needs.map((n) => [n.id, n]));
  const position = new Map(result.order.map((id, i) => [id, i]));
  const late = [
    ...result.proposals.filter((p) => p.lateDays > 0).map((p) => p.needId),
    ...result.unplaced.filter((u) => u.reason === 'no_slot').map((u) => u.needId),
  ];
  const sheets = new Map<string, ConflictSheet>();
  for (const id of late) {
    const x = needById.get(id)!;
    const rule = validated.find((r) => r.resourceIds.includes(x.resourceId));
    const group = rule ? rule.resourceIds : [x.resourceId];
    const from = x.earliestOn > input.fromOn ? x.earliestOn : input.fromOn;
    const competitors = result.proposals
      .filter((p) => p.needId !== id && (position.get(p.needId) ?? 0) < (position.get(id) ?? 0) && group.includes(p.resourceId)
        && dayOf(p.end - 1) >= from && dayOf(p.start) <= x.deadlineOn)
      .sort((a, b) => (position.get(a.needId) ?? 0) - (position.get(b.needId) ?? 0))
      .slice(0, 3)
      .map((p) => needById.get(p.needId)!);
    if (!competitors.length) continue;
    const involved = [x, ...competitors];
    const needIds = involved.map((n) => n.id).sort();
    const key = needIds.join(',');
    if (sheets.has(key)) continue;
    const asProposed = involved.slice().sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
    const options: ConflictOption[] = [{
      key: 'as_proposed', order: asProposed.map((n) => n.id), orderRefs: asProposed.map((n) => n.ref),
      outcomes: outcomesOf(result, involved), score: planScore(result, involved, input.today),
    }];
    for (const y of competitors) {
      const precedences = [...(input.precedences ?? []), [x.id, y.id] as const];
      const rerun = proposePlan({ ...input, precedences });
      const order = rerun.order.filter((n) => needIds.includes(n));
      options.push({
        key: `${x.ref}>${y.ref}`, order, orderRefs: order.map((n) => needById.get(n)!.ref),
        outcomes: outcomesOf(rerun, involved), score: planScore(rerun, involved, input.today),
      });
    }
    const best = options.reduce((a, b) => (compareScores(b.score, a.score) < 0 ? b : a));
    const decided = decidingCriterion(competitors[0], x, input.criteria, input.today);
    sheets.set(key, {
      needIds, lateNeedId: x.id, subject: rule ? rule.code : codes.resourceCode(x.resourceId), options, recommendedKey: best.key,
      criterion: decided?.criterion ?? null, rank: decided?.rank ?? null,
      critical: options.some((o) => o.outcomes.some((oc) => (oc.lateDays == null || oc.lateDays > 0) && isCritical(needById.get(oc.needId)!, input.today))),
    });
  }
  return [...sheets.values()];
}

/** A-6: a decision is expected within 2 working days. */
export const ARBITRATION_WORKDAYS = 2;
export const conflictDueOn = (today: string) => addWorkdaysIso(today, ARBITRATION_WORKDAYS);

/** A-4: the coordinator decides unless an option leaves a critical need late; the R&D director decides everything. */
export function canDecide(role: string, decider: string): boolean {
  return role === 'rd_director' || (role === 'coordinator' && decider === 'coordinator');
}
