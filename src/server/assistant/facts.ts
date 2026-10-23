import 'server-only';
// The assistant's lookups (docs/spec/04 §2–3, decisions I-2, I-4; delivery 6): what the assistant may read to answer, as plain
// facts. Each one runs with the rights of the person who asks — the facilities and projects they see (U-3), the actions their
// role allows — and returns codes, dates and EN source labels. Nothing here writes: a simulation is built and dropped, a need is
// only checked and returned as a draft for the person to validate in the needs form.
//
// Audience: `local` (the rule-based templates; nothing leaves Crucible) or `external` (sent to the AI provider). For the
// provider (I-4): the strict necessary, no project marked confidential (its code, name and tests are replaced by a marker), no
// personal data but the names of the people planned on a test.
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { ISSUE_LABEL } from '@/domain/booking';
import { isIsoDate } from '@/domain/clock';
import { mondayOf } from '@/domain/calendar';
import { proposePlan, traceNeed, type EngineInput, type EngineNeed, type TraceCause } from '@/domain/engine';
import { checkNeed, NEED_LEVEL_LABEL } from '@/domain/needs';
import { PRIORITY_CRITERION_LABEL, PROPOSAL_STATUS_LABEL, CONFLICT_STATUS_LABEL, UNPLACED_REASON_LABEL, type PriorityCriterion, type UnplacedReason } from '@/domain/planning-vocabulary';
import { criterionValue } from '@/domain/priority';
import { canManageNeeds, canSeeProject, projectVisibility } from '@/domain/rights';
import { addDaysIso, parisInstant, parisParts } from '@/lib/dates';
import { businessNow, businessToday } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { arbitrations, bookings, conflicts, planRuns, people, projectMilestones, projects, proposals, resources, substitutions, testNeeds, testTypes } from '@/server/db/schema';
import { needContext, needWarnings } from '@/server/dal/need-context';
import { loadScreen } from '@/server/dal/needs';
import { visibleFacilities } from '@/server/dal/visibility';
import { engineInput } from '@/server/planning/engine-run';
import { buildScenario } from '@/server/planning/scenarios';
import type { Viewer } from '@/server/viewer';

export type Audience = 'local' | 'external';
export type FactsResult<T> = { ok: true; facts: T } | { ok: false; error: string };

/** Shown instead of a project the viewer does not see, or a confidential one sent to the provider. */
export const PROJECT_NOT_VISIBLE = 'Project not visible';
export const PROJECT_CONFIDENTIAL = 'Confidential project';
const NOT_FOUND = 'Not found, or outside your workspace';

/** "2026-11-03 am": the half-day of an instant (Paris). */
export function halfDayOf(ms: number): string {
  const p = parisParts(new Date(ms));
  return `${p.iso} ${Number(p.hh) < 13 ? 'am' : 'pm'}`;
}
/** Last half-day covered by a block ending at `end`. */
const lastHalfDayOf = (end: number) => halfDayOf(end - 1);

interface Scope {
  facilityCodes: Set<string>;
  project: (p: { code: string; entityCode: string; confidential: boolean }) => string | null;
}

/** What the viewer sees, and how a project is named for the audience (null: masked). */
async function scopeOf(viewer: Viewer, audience: Audience): Promise<Scope & { projectLabel: (p: { code: string; entityCode: string; confidential: boolean }) => string }> {
  const facs = await visibleFacilities(viewer);
  const pv = projectVisibility(viewer.role, viewer.assignments);
  const project = (p: { code: string; entityCode: string; confidential: boolean }) =>
    !canSeeProject(pv, p) ? null : audience === 'external' && p.confidential ? null : p.code;
  const projectLabel = (p: { code: string; entityCode: string; confidential: boolean }) =>
    project(p) ?? (canSeeProject(pv, p) && p.confidential ? PROJECT_CONFIDENTIAL : PROJECT_NOT_VISIBLE);
  return { facilityCodes: new Set(facs.map((f) => f.code)), project, projectLabel };
}

/** A refusal cause as facts: the EN label, its reference, and what holds the slot. */
function causeFacts(c: TraceCause): { cause: string; ref: string | null; heldBy: string[] } {
  switch (c.kind) {
    case 'issue': return { cause: ISSUE_LABEL[c.code], ref: c.ref, heldBy: c.by };
    case 'shutdown': return { cause: 'A shutdown falls inside the test', ref: null, heldBy: [] };
    case 'staff': return { cause: 'No qualified person available', ref: c.skillCode, heldBy: [] };
    case 'equipment': return { cause: 'The mobile equipment is not available', ref: c.codes.join(', '), heldBy: [] };
  }
}

// ── Context: what the person may ask about ───────────────────────────────────────────────────────────────────────────────

export interface ContextFacts {
  today: string;
  role: string;
  facilities: { code: string; name: string }[];
  resources: { code: string; name: string; facility: string; status: string }[];
  testTypes: { code: string; name: string; nominalResource: string | null; typicalHalfDays: number; validatedSubstitutes: string[] }[];
  projects: { code: string; name: string; milestones: { label: string; dueOn: string; criticality: string }[] }[];
  openConflicts: string[];
  latestRun: string | null;
  openNeeds: { ref: string; project: string; resource: string; deadlineOn: string }[];
}

/** The reference data the person sees: facilities, resources, test types and their validated substitutes, projects, open items. */
export async function contextFacts(viewer: Viewer, audience: Audience): Promise<ContextFacts> {
  const db = await getDb();
  const today = await businessToday();
  const sc = await scopeOf(viewer, audience);
  const facs = await visibleFacilities(viewer);
  const codes = [...sc.facilityCodes];
  const [res, types, subs, projs, ms, openC, [run], needs] = await Promise.all([
    codes.length ? db.select().from(resources).where(and(inArray(resources.facilityCode, codes), ne(resources.status, 'retired'))).orderBy(asc(resources.code)) : [],
    db.select().from(testTypes).where(eq(testTypes.active, true)).orderBy(asc(testTypes.code)),
    db.select({ testTypeCode: substitutions.testTypeCode, resourceId: substitutions.resourceId }).from(substitutions).where(eq(substitutions.status, 'validated')),
    db.select().from(projects).where(eq(projects.active, true)).orderBy(asc(projects.code)),
    db.select().from(projectMilestones).where(eq(projectMilestones.source, 'crucible')).orderBy(asc(projectMilestones.dueOn)),
    db.select({ ref: conflicts.ref, needIds: conflicts.needIds }).from(conflicts).where(inArray(conflicts.status, ['open', 'vetoed'])).orderBy(asc(conflicts.ref)),
    db.select({ ref: planRuns.ref }).from(planRuns).orderBy(desc(planRuns.runAt)).limit(1),
    db.select({ n: testNeeds, entityCode: projects.entityCode, confidential: projects.confidential, facilityCode: resources.facilityCode, resourceCode: resources.code })
      .from(testNeeds).innerJoin(projects, eq(projects.code, testNeeds.projectCode)).innerJoin(resources, eq(resources.id, testNeeds.resourceId))
      .where(eq(testNeeds.status, 'open')).orderBy(asc(testNeeds.deadlineOn)),
  ]);
  const codeOf = new Map(res.map((r) => [r.id, r.code]));
  const visibleNeeds = needs.filter((x) => sc.facilityCodes.has(x.facilityCode));
  const visibleNeedIds = new Set(visibleNeeds.map((x) => x.n.id));
  const mine = projs.filter((p) => sc.project(p));
  return {
    today, role: viewer.role,
    facilities: facs.map((f) => ({ code: f.code, name: f.name })),
    resources: res.map((r) => ({ code: r.code, name: r.name, facility: r.facilityCode, status: r.status })),
    testTypes: types.map((x) => ({
      code: x.code, name: x.name, nominalResource: x.nominalResourceId ? codeOf.get(x.nominalResourceId) ?? null : null, typicalHalfDays: x.typicalHalfDays,
      validatedSubstitutes: subs.filter((s) => s.testTypeCode === x.code).map((s) => codeOf.get(s.resourceId)).filter((c): c is string => !!c).sort(),
    })),
    projects: mine.map((p) => ({
      code: p.code, name: p.name,
      milestones: ms.filter((m) => m.projectCode === p.code && m.dueOn >= today).map((m) => ({ label: m.label, dueOn: m.dueOn, criticality: m.criticality })),
    })),
    openConflicts: openC.filter((c) => c.needIds.some((id) => visibleNeedIds.has(id))).map((c) => c.ref),
    latestRun: run?.ref ?? null,
    openNeeds: visibleNeeds.filter((x) => x.n.deadlineOn >= today).slice(0, 40)
      .map((x) => ({ ref: x.n.ref, project: sc.projectLabel({ code: x.n.projectCode, entityCode: x.entityCode, confidential: x.confidential }), resource: x.resourceCode, deadlineOn: x.n.deadlineOn })),
  };
}

/** A criterion for one need, in words: "yes" / "no", "P2", "3 working days", the request day. */
export function criterionText(c: PriorityCriterion, n: EngineNeed, today: string): string {
  const v = criterionValue(c, n, today);
  switch (c) {
    case 'safety_regulatory': case 'contractual': case 'critical_milestone': return v === 0 ? 'yes' : 'no';
    case 'priority_class': return n.priorityClass;
    case 'slack': return `${v} working days`;
    case 'seniority': return `requested on ${parisParts(new Date(n.requestedAt)).iso}`;
  }
}

// ── Explain a need: why this slot and not an earlier one ─────────────────────────────────────────────────────────────────

export interface NeedFacts {
  need: {
    ref: string; project: string; title: string | null; testType: string | null; resource: string; facility: string; level: string;
    halfDays: number; remainingHalfDays: number; earliestOn: string; deadlineOn: string; status: string;
  };
  /** Its place in the service order of the engine and the value of each criterion (smaller is served first). */
  serviceOrder: { rank: number; of: number; ruleVersion: number; criteria: { criterion: string; value: string }[] } | null;
  /** The slot the engine gives it on the current state of the planning. */
  slot: { resource: string; substitute: boolean; from: string; to: string; lateDays: number; staff: string[]; equipment: string[] } | null;
  unplacedReason: string | null;
  /** Why each earlier slot was refused, in periods. */
  waitedFor: { resource: string; from: string; to: string; cause: string; ref: string | null; heldBy: string[] }[];
  /** Needs served before it that held a slot it could have taken. */
  servedBefore: { ref: string; project: string }[];
  /** The latest run of the engine (the proposals screen) and what it proposed for this need. */
  latestRun: { ref: string; proposal: { resource: string; from: string; to: string; lateDays: number; status: string } | null; differs: boolean } | null;
  booked: { ref: string; resource: string; from: string; to: string; status: string }[];
}

export async function needFacts(viewer: Viewer, ref: string, audience: Audience): Promise<FactsResult<NeedFacts>> {
  const db = await getDb();
  const [today, now] = await Promise.all([businessToday(), businessNow()]);
  const sc = await scopeOf(viewer, audience);
  const [row] = await db.select({ n: testNeeds, entityCode: projects.entityCode, confidential: projects.confidential, resourceCode: resources.code, facilityCode: resources.facilityCode })
    .from(testNeeds).innerJoin(projects, eq(projects.code, testNeeds.projectCode)).innerJoin(resources, eq(resources.id, testNeeds.resourceId))
    .where(eq(testNeeds.ref, ref.trim().toUpperCase()));
  if (!row || !sc.facilityCodes.has(row.facilityCode)) return { ok: false, error: NOT_FOUND };
  const proj = { code: row.n.projectCode, entityCode: row.entityCode, confidential: row.confidential };
  if (audience === 'external' && row.confidential) return { ok: false, error: 'This need belongs to a confidential project: it is not sent to the AI provider' };
  const visible = sc.project(proj) != null;
  const ctx = await engineInput(db, today, now);
  const result = proposePlan(ctx.input);
  const trace = traceNeed(ctx.input, result, row.n.id);
  const code = (id: string) => ctx.resourceCode.get(id) ?? id;
  const engNeed = ctx.input.needs.find((n) => n.id === row.n.id);
  const proposal = result.proposals.find((p) => p.needId === row.n.id) ?? null;
  const names = new Map((await db.select({ id: people.id, name: people.name }).from(people)).map((p) => [p.id, p.name]));
  // Needs served before it, as the viewer may name them.
  const before = trace?.servedBefore.length
    ? await db.select({ ref: testNeeds.ref, code: testNeeds.projectCode, entityCode: projects.entityCode, confidential: projects.confidential })
      .from(testNeeds).innerJoin(projects, eq(projects.code, testNeeds.projectCode)).where(inArray(testNeeds.ref, trace.servedBefore))
    : [];
  const [run] = await db.select().from(planRuns).orderBy(desc(planRuns.runAt)).limit(1);
  const [stored] = run
    ? await db.select({ p: proposals, resourceCode: resources.code }).from(proposals).innerJoin(resources, eq(resources.id, proposals.resourceId))
      .where(and(eq(proposals.runId, run.id), eq(proposals.needId, row.n.id)))
    : [];
  const held = await db.select({ ref: bookings.ref, resourceCode: resources.code, start: bookings.startsAt, end: bookings.endsAt, status: bookings.status })
    .from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId))
    .where(and(eq(bookings.needId, row.n.id), ne(bookings.status, 'cancelled'))).orderBy(asc(bookings.startsAt));
  return {
    ok: true,
    facts: {
      need: {
        ref: row.n.ref, project: sc.projectLabel(proj), title: visible ? row.n.title : null, testType: row.n.testTypeCode, resource: row.resourceCode, facility: row.facilityCode,
        level: NEED_LEVEL_LABEL[row.n.level], halfDays: row.n.halfDays, remainingHalfDays: engNeed?.remainingHalfDays ?? 0,
        earliestOn: row.n.earliestOn, deadlineOn: row.n.deadlineOn, status: row.n.status,
      },
      serviceOrder: trace ? {
        rank: trace.rank, of: result.order.length, ruleVersion: ctx.ruleVersion,
        criteria: engNeed ? Object.keys(PRIORITY_CRITERION_LABEL).filter((c) => ctx.input.criteria.includes(c as PriorityCriterion))
          .sort((a, b) => ctx.input.criteria.indexOf(a as PriorityCriterion) - ctx.input.criteria.indexOf(b as PriorityCriterion))
          .map((c) => ({ criterion: PRIORITY_CRITERION_LABEL[c as PriorityCriterion], value: criterionText(c as PriorityCriterion, engNeed, today) })) : [],
      } : null,
      slot: proposal ? {
        resource: code(proposal.resourceId), substitute: proposal.substitute, from: halfDayOf(proposal.start), to: lastHalfDayOf(proposal.end), lateDays: proposal.lateDays,
        staff: proposal.staff.map((s) => names.get(s.personId) ?? '').filter(Boolean), equipment: proposal.equipment,
      } : null,
      unplacedReason: trace?.unplacedReason ? UNPLACED_REASON_LABEL[trace.unplacedReason] : null,
      waitedFor: (trace?.steps ?? []).slice(0, 30).map((s) => ({ resource: s.resourceCode, from: halfDayOf(s.from), to: halfDayOf(s.to), ...causeFacts(s.cause) })),
      servedBefore: before.map((b) => ({ ref: b.ref, project: sc.projectLabel({ code: b.code, entityCode: b.entityCode, confidential: b.confidential }) })),
      latestRun: run ? {
        ref: run.ref,
        proposal: stored ? { resource: stored.resourceCode, from: halfDayOf(stored.p.startsAt.getTime()), to: lastHalfDayOf(stored.p.endsAt.getTime()), lateDays: stored.p.lateDays, status: PROPOSAL_STATUS_LABEL[stored.p.status] } : null,
        differs: !!stored !== !!proposal || (!!stored && !!proposal && (stored.p.resourceId !== proposal.resourceId || stored.p.startsAt.getTime() !== proposal.start)),
      } : null,
      booked: held.map((b) => ({ ref: b.ref, resource: b.resourceCode, from: halfDayOf(b.start.getTime()), to: lastHalfDayOf(b.end.getTime()), status: b.status })),
    },
  };
}

// ── Explain a conflict and prepare its arbitration ───────────────────────────────────────────────────────────────────────

export interface ConflictFacts {
  ref: string;
  status: string;
  /** To arbitrate (open, or vetoed by the safety officer). */
  open: boolean;
  /** Exclusion rule or resource where the needs compete. */
  subject: string;
  ruleCited: string;
  ruleRank: number | null;
  ruleVersion: number;
  decider: string;
  dueOn: string;
  needs: { ref: string; project: string; deadlineOn: string }[];
  recommended: string;
  options: { key: string; order: string[]; recommended: boolean; outcomes: { need: string; resource: string | null; from: string | null; to: string | null; lateDays: number | null; substitute: boolean }[] }[];
  decisions: { kind: string; option: string | null; reason: string; byRole: string; on: string }[];
}

export async function conflictFacts(viewer: Viewer, ref: string, audience: Audience): Promise<FactsResult<ConflictFacts>> {
  const db = await getDb();
  const sc = await scopeOf(viewer, audience);
  const [c] = await db.select().from(conflicts).where(eq(conflicts.ref, ref.trim().toUpperCase()));
  if (!c) return { ok: false, error: NOT_FOUND };
  const rows = await db.select({ id: testNeeds.id, ref: testNeeds.ref, code: testNeeds.projectCode, deadlineOn: testNeeds.deadlineOn, entityCode: projects.entityCode, confidential: projects.confidential, facilityCode: resources.facilityCode })
    .from(testNeeds).innerJoin(projects, eq(projects.code, testNeeds.projectCode)).innerJoin(resources, eq(resources.id, testNeeds.resourceId))
    .where(inArray(testNeeds.id, c.needIds));
  if (!rows.some((r) => sc.facilityCodes.has(r.facilityCode))) return { ok: false, error: NOT_FOUND };
  const res = await db.select({ id: resources.id, code: resources.code }).from(resources);
  const code = new Map(res.map((r) => [r.id, r.code]));
  const decided = await db.select().from(arbitrations).where(eq(arbitrations.conflictId, c.id)).orderBy(asc(arbitrations.decidedAt));
  const options = c.options as unknown as { key: string; orderRefs: string[]; outcomes: { needRef: string; resourceId: string | null; start: number | null; end: number | null; substitute: boolean; lateDays: number | null }[] }[];
  return {
    ok: true,
    facts: {
      ref: c.ref, status: CONFLICT_STATUS_LABEL[c.status], open: c.status === 'open' || c.status === 'vetoed', subject: c.subject,
      ruleCited: c.ruleCited === 'tie' ? 'Equal on every criterion: a person decides'
        : c.ruleCited in PRIORITY_CRITERION_LABEL ? PRIORITY_CRITERION_LABEL[c.ruleCited as PriorityCriterion] : c.ruleCited,
      ruleRank: c.ruleRank, ruleVersion: c.ruleVersion, decider: c.decider, dueOn: c.dueOn,
      needs: [...rows].sort((a, b) => a.ref.localeCompare(b.ref)).map((r) => ({ ref: r.ref, project: sc.projectLabel({ code: r.code, entityCode: r.entityCode, confidential: r.confidential }), deadlineOn: r.deadlineOn })),
      recommended: c.recommendedKey,
      options: options.map((o) => ({
        key: o.key, order: o.orderRefs, recommended: o.key === c.recommendedKey,
        outcomes: o.outcomes.map((x) => ({
          need: x.needRef, resource: x.resourceId ? code.get(x.resourceId) ?? null : null, from: x.start != null ? halfDayOf(x.start) : null,
          to: x.end != null ? lastHalfDayOf(x.end) : null, lateDays: x.lateDays, substitute: x.substitute,
        })),
      })),
      // Decisions: who decided is given by role (no personal data but the people planned, I-4); the reason as typed.
      decisions: decided.map((d) => ({ kind: d.kind, option: d.optionKey, reason: d.reason, byRole: d.decidedByRole, on: parisParts(d.decidedAt).iso })),
    },
  };
}

// ── Where can I do this test? (validated substitutions only, R-4) ────────────────────────────────────────────────────────

export interface AlternativesFacts {
  testType: string | null;
  halfDays: number;
  window: { from: string; to: string };
  options: { resource: string; facility: string; substitute: boolean; slot: { from: string; to: string; lateDays: number } | null; reason: string | null }[];
  note: string;
}

export async function alternativesFacts(viewer: Viewer, q: { testType?: string | null; resource?: string | null; fromOn?: string | null; toOn?: string | null; halfDays?: number | null }): Promise<FactsResult<AlternativesFacts>> {
  const db = await getDb();
  const [today, now] = await Promise.all([businessToday(), businessNow()]);
  const sc = await scopeOf(viewer, 'local');
  const fromOn = q.fromOn && isIsoDate(q.fromOn) && q.fromOn > today ? q.fromOn : addDaysIso(today, 1);
  const toOn = q.toOn && isIsoDate(q.toOn) && q.toOn >= fromOn ? q.toOn : addDaysIso(mondayOf(fromOn), 4) >= fromOn ? addDaysIso(mondayOf(fromOn), 4) : fromOn;
  const all = await db.select().from(resources).where(ne(resources.status, 'retired'));
  const byCode = new Map(all.map((r) => [r.code, r]));
  let type = q.testType ? (await db.select().from(testTypes).where(eq(testTypes.code, q.testType.trim().toUpperCase())))[0] ?? null : null;
  if (q.testType && !type) return { ok: false, error: 'Choose a test type of the catalogue' };
  const asked = q.resource ? byCode.get(q.resource.trim().toUpperCase()) ?? null : null;
  if (q.resource && (!asked || !sc.facilityCodes.has(asked.facilityCode))) return { ok: false, error: NOT_FOUND };
  if (!type && asked) type = (await db.select().from(testTypes).where(and(eq(testTypes.nominalResourceId, asked.id), eq(testTypes.active, true))).orderBy(asc(testTypes.code)))[0] ?? null;
  if (!type && !asked) return { ok: false, error: 'Name a test type or a resource' };
  const nominalId = asked?.id ?? type?.nominalResourceId ?? null;
  const subs = type ? await db.select({ resourceId: substitutions.resourceId }).from(substitutions).where(and(eq(substitutions.testTypeCode, type.code), eq(substitutions.status, 'validated'))) : [];
  const ids = [...new Set([...(nominalId ? [nominalId] : []), ...subs.map((s) => s.resourceId)])];
  const candidates = ids.map((id) => all.find((r) => r.id === id)).filter((r): r is (typeof all)[number] => !!r && sc.facilityCodes.has(r.facilityCode));
  const halfDays = Math.max(1, Math.min(40, Math.round(q.halfDays ?? type?.typicalHalfDays ?? 2)));
  const ctx = await engineInput(db, today, now);
  const options: AlternativesFacts['options'] = [];
  for (const r of candidates) {
    // The test alone on what holds now (confirmed bookings, unavailabilities, rules, people): the engine's first block.
    const probe: EngineNeed = {
      id: 'probe', ref: 'probe', projectCode: '', entityCode: viewer.entityCode ?? '', priorityClass: 'P1', criticality: null, remainingHalfDays: halfDays,
      earliestOn: fromOn, deadlineOn: toOn, requestedAt: now.getTime(), resourceId: r.id, testTypeCode: type?.code ?? null,
    };
    const input: EngineInput = { ...ctx.input, needs: [probe], substitutes: new Map(), precedences: [] };
    const out = proposePlan(input);
    const p = out.proposals[0];
    options.push({
      resource: r.code, facility: r.facilityCode, substitute: r.id !== nominalId,
      slot: p ? { from: halfDayOf(p.start), to: lastHalfDayOf(p.end), lateDays: p.lateDays } : null,
      reason: p ? null : UNPLACED_REASON_LABEL[(out.unplaced[0]?.reason ?? 'no_slot') as UnplacedReason],
    });
  }
  return {
    ok: true,
    facts: {
      testType: type?.code ?? null, halfDays, window: { from: fromOn, to: toOn }, options,
      note: 'Only the nominal resource and the validated substitutions are proposed (R-4); a slot is free on what holds now and is confirmed only by a booking request',
    },
  };
}

// ── Anticipate: bottlenecks and the needs they put at risk ───────────────────────────────────────────────────────────────

export interface LoadRiskFacts {
  window: { from: string; to: string };
  bottlenecks: { subject: string; weeks: { monday: string; loadPercent: number }[]; needsAtRisk: { ref: string; project: string; resource: string; deadlineOn: string; remainingHalfDays: number }[] }[];
  inspections: { need: string; resource: string; inspection: string; dueOn: string }[];
}

/** "2027-T1" → its first and last days; else the next 13 weeks. */
function windowOf(today: string, quarter?: string | null, fromOn?: string | null, toOn?: string | null): { from: string; to: string } {
  const m = quarter ? /^(\d{4})-[TQ]([1-4])$/i.exec(quarter.trim()) : null;
  if (m) {
    const first = `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, '0')}-01`;
    const next = Number(m[2]) === 4 ? `${Number(m[1]) + 1}-01-01` : `${m[1]}-${String(Number(m[2]) * 3 + 1).padStart(2, '0')}-01`;
    return { from: first, to: addDaysIso(next, -1) };
  }
  const from = fromOn && isIsoDate(fromOn) ? fromOn : today;
  return { from, to: toOn && isIsoDate(toOn) && toOn >= from ? toOn : addDaysIso(from, 7 * 13 - 1) };
}

export async function loadRiskFacts(viewer: Viewer, q: { facility?: string | null; quarter?: string | null; fromOn?: string | null; toOn?: string | null }, audience: Audience): Promise<FactsResult<LoadRiskFacts>> {
  const today = await businessToday();
  const data = await loadScreen(viewer, today);
  const facility = q.facility?.trim().toUpperCase() || null;
  if (facility && !data.facilities.some((f) => f.code === facility)) return { ok: false, error: NOT_FOUND };
  const w = windowOf(today, q.quarter, q.fromOn, q.toOn);
  const ofFacility = (subject: string) => {
    if (!facility) return true;
    const r = data.resources.find((x) => x.code === subject);
    if (r) return r.facilityCode === facility;
    return data.rules.find((x) => x.code === subject)?.facilityCodes.includes(facility) ?? false;
  };
  const groups = new Map<string, { monday: string; loadPercent: number }[]>();
  for (const s of data.signals) {
    if (s.kind !== 'bottleneck' || s.monday > w.to || addDaysIso(s.monday, 6) < w.from || !ofFacility(s.subject)) continue;
    groups.set(s.subject, [...(groups.get(s.subject) ?? []), { monday: s.monday, loadPercent: Math.round(s.ratio * 100) }]);
  }
  const resourcesOf = (subject: string) => {
    const r = data.resources.find((x) => x.code === subject);
    if (r) return new Set([r.id]);
    return new Set(data.rules.find((x) => x.code === subject)?.resourceIds ?? []);
  };
  const label = (n: (typeof data.needs)[number]) =>
    audience === 'external' && n.confidential ? PROJECT_CONFIDENTIAL : n.projectCode ?? PROJECT_NOT_VISIBLE;
  return {
    ok: true,
    facts: {
      window: w,
      bottlenecks: [...groups].map(([subject, weeks]) => {
        const ids = resourcesOf(subject);
        const first = weeks[0].monday;
        const last = addDaysIso(weeks[weeks.length - 1].monday, 6);
        return {
          subject, weeks,
          needsAtRisk: data.needs
            .filter((n) => ids.has(n.resourceId) && (n.spread?.remainingHalfDays ?? 0) > 0 && n.earliestOn <= last && n.deadlineOn >= first)
            .map((n) => ({ ref: n.ref, project: label(n), resource: n.resourceCode, deadlineOn: n.deadlineOn, remainingHalfDays: n.spread?.remainingHalfDays ?? 0 })),
        };
      }),
      inspections: data.inspectionAlerts.filter((a) => !facility || data.resources.find((r) => r.code === a.resourceCode)?.facilityCode === facility)
        .map((a) => ({ need: a.needRef, resource: a.resourceCode, inspection: a.label, dueOn: a.dueOn })),
    },
  };
}

// ── What if a resource were out? (built and dropped: nothing is recorded) ────────────────────────────────────────────────

export interface SimulationFacts {
  hypothesis: { resource: string; fromOn: string; toOn: string };
  moved: { booking: string; need: string | null; project: string; from: string; to: string | null; toResource: string | null; reason: string | null }[];
  impacts: { project: string; booking: string; deadlineOn: string; lateBefore: number; lateAfter: number | null }[];
  note: string;
}

/** Who may simulate: as the "What if?" form (src/features/incidents/actions.ts). */
export const canSimulate = (role: string) => ['rd_director', 'coordinator', 'project_lead'].includes(role);

export async function simulationFacts(viewer: Viewer, q: { resource: string; fromOn: string; toOn?: string | null }, audience: Audience): Promise<FactsResult<SimulationFacts>> {
  if (!canSimulate(viewer.role)) return { ok: false, error: 'Simulations are for the R&D director, the coordinator and the project leads' };
  const fromOn = q.fromOn;
  const toOn = q.toOn || fromOn;
  if (!isIsoDate(fromOn) || !isIsoDate(toOn) || toOn < fromOn) return { ok: false, error: 'Enter the first and last days' };
  const db = await getDb();
  const sc = await scopeOf(viewer, audience);
  const [r] = await db.select().from(resources).where(eq(resources.code, q.resource.trim().toUpperCase()));
  if (!r || !sc.facilityCodes.has(r.facilityCode)) return { ok: false, error: NOT_FOUND };
  const [today, now] = await Promise.all([businessToday(), businessNow()]);
  const built = await db.transaction((tx) => buildScenario(tx, { kind: 'breakdown', resourceId: r.id, start: parisInstant(fromOn, '00:00'), end: parisInstant(addDaysIso(toOn, 1), '00:00'), label: 'What if', hypothetical: true }, today, now));
  const projs = await db.select({ code: projects.code, entityCode: projects.entityCode, confidential: projects.confidential }).from(projects);
  const projOf = new Map(projs.map((p) => [p.code, p]));
  const label = (code: string) => {
    const p = projOf.get(code);
    return p ? sc.projectLabel(p) : PROJECT_NOT_VISIBLE;
  };
  const codes = new Map((await db.select({ id: resources.id, code: resources.code }).from(resources)).map((x) => [x.id, x.code]));
  return {
    ok: true,
    facts: {
      hypothesis: { resource: r.code, fromOn, toOn },
      moved: built.moves.map((m) => ({
        booking: m.ref, need: m.needRef, project: label(m.projectCode), from: halfDayOf(m.from.start), to: m.to ? halfDayOf(m.to.start) : null,
        toResource: m.to ? codes.get(m.to.resourceId) ?? null : null, reason: m.reason ? UNPLACED_REASON_LABEL[m.reason] : null,
      })),
      impacts: built.impacts.map((i) => ({ project: label(i.projectCode), booking: i.ref, deadlineOn: i.deadlineOn, lateBefore: i.lateBefore, lateAfter: i.lateAfter })),
      note: 'A simulation: nothing was recorded, moved or notified. To act, declare the incident on the Incidents screen.',
    },
  };
}

// ── Prepare a need: checked like the form, written only by the person ────────────────────────────────────────────────────

export interface NeedDraft {
  projectCode: string;
  level: 'forecast' | 'request';
  title: string;
  testTypeCode: string | null;
  resourceId: string;
  resourceCode: string;
  halfDays: number;
  milestoneId: string | null;
  milestoneLabel: string | null;
  earliestOn: string;
  deadlineOn: string;
  note: string | null;
}

export interface DraftInput {
  project: string;
  level?: string | null;
  title: string;
  testType?: string | null;
  resource?: string | null;
  halfDays?: number | null;
  milestone?: string | null;
  earliestOn?: string | null;
  deadlineOn?: string | null;
  note?: string | null;
}

export async function prepareNeedFacts(viewer: Viewer, d: DraftInput): Promise<FactsResult<{ draft: NeedDraft; warnings: string[] }>> {
  const db = await getDb();
  const today = await businessToday();
  const [p] = await db.select().from(projects).where(and(eq(projects.code, d.project.trim().toUpperCase()), eq(projects.active, true)));
  if (!p || !canManageNeeds(viewer.role, viewer.assignments, p)) return { ok: false, error: 'You do not enter the needs of this project' };
  const type = d.testType ? (await db.select().from(testTypes).where(eq(testTypes.code, d.testType.trim().toUpperCase())))[0] ?? null : null;
  const resource = d.resource
    ? (await db.select().from(resources).where(eq(resources.code, d.resource.trim().toUpperCase())))[0] ?? null
    : type?.nominalResourceId ? (await db.select().from(resources).where(eq(resources.id, type.nominalResourceId)))[0] ?? null : null;
  if (!resource) return { ok: false, error: 'Choose one of the resources' };
  const ms = d.milestone ? await db.select().from(projectMilestones).where(eq(projectMilestones.projectCode, p.code)) : [];
  const wanted = d.milestone?.trim().toLowerCase();
  const milestone = wanted ? ms.find((m) => m.label.toLowerCase() === wanted) ?? ms.find((m) => m.label.toLowerCase().includes(wanted)) ?? null : null;
  if (d.milestone && !milestone) return { ok: false, error: 'Choose a milestone of the project' };
  const ctx = await needContext(db, viewer, p.code, today);
  const raw = {
    level: d.level ?? 'forecast', title: d.title, resourceId: resource.id, halfDays: String(d.halfDays ?? type?.typicalHalfDays ?? 2),
    milestoneId: milestone?.id ?? '', testTypeCode: type?.code ?? '', earliestOn: d.earliestOn ?? '', deadlineOn: d.deadlineOn ?? '', note: d.note ?? '',
  };
  const c = checkNeed(raw, ctx);
  if (!c.ok) return c;
  const warnings = await needWarnings(db, c.value, resource.facilityCode, p.entityCode, today, c.warnings);
  return {
    ok: true,
    facts: {
      draft: {
        projectCode: p.code, level: c.value.level, title: c.value.title, testTypeCode: c.value.testTypeCode, resourceId: resource.id, resourceCode: resource.code,
        halfDays: c.value.halfDays, milestoneId: c.value.milestoneId, milestoneLabel: milestone?.label ?? null, earliestOn: c.value.earliestOn, deadlineOn: c.value.deadlineOn, note: c.value.note,
      },
      warnings,
    },
  };
}
