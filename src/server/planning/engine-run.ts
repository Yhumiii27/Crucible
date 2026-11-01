import 'server-only';
// A run of the proposal engine (T-3, F-3; delivery 4): loads its input from the database — resources, calendars,
// unavailabilities, inspections, the bookings that hold a resource with their people and equipment, the exclusion rules, the
// open needs and what is left of them, people and their skills and absences, the requirements of the test types, the
// validated substitutions, the current priority rules and the arbitrated precedences —, runs the pure engine, and records the
// run, its proposals (the previous run's open proposals are superseded) and its conflict sheets (a sheet found again is
// updated, an open sheet no longer found becomes obsolete). Runs inside the caller's transaction, under the write lock.
// Nothing here changes a booking: the engine proposes, a person decides.
import { and, desc, eq, gte, inArray, like, lt, ne } from 'drizzle-orm';
import { DEFAULT_HOURS, inspectionDueOn } from '@/domain/calendar';
import { maintenanceDueOn } from '@/domain/maintenance';
import { conflictDueOn, detectConflicts } from '@/domain/conflicts';
import { proposePlan, type EngineInput, type EngineResult } from '@/domain/engine';
import { loadForecast } from '@/domain/load';
import { HOLDING } from '@/domain/resources';
import { PRIORITY_CRITERIA, type PriorityCriterion } from '@/domain/planning-vocabulary';
import { addDaysIso, parisInstant, parisParts } from '@/lib/dates';
import { writeAudit } from '@/server/db/helpers';
import {
  arbitrations, bookingEquipment, bookingStaff, bookings, conflicts, facilities, inspections, maintenancePlans, people, personAbsences, personSkills, planRuns, priorityRuleSets,
  projectMilestones, projects, proposals, resources, substitutions, testNeeds, testTypeEquipment, testTypeSkills, unavailabilities,
} from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import { calendarsOf, rulesOf } from '@/server/dal/resources';
import { notify, usersWithRole } from '@/server/notify';

type Q = DB | Tx;
const ms = (d: Date) => d.getTime();

/** Horizon of the engine: the detailed horizon of the plan (F-6). */
export const ENGINE_WEEKS = 26;

/** The current priority rules: the latest published version, or the starting order (A-2) as version 1 if none. */
export async function currentRuleSet(q: Q): Promise<{ version: number; criteria: PriorityCriterion[] }> {
  const [last] = await q.select().from(priorityRuleSets).orderBy(desc(priorityRuleSets.version)).limit(1);
  return last ? { version: last.version, criteria: last.criteria as PriorityCriterion[] } : { version: 1, criteria: [...PRIORITY_CRITERIA] };
}

/** Precedences decided by people: the latest arbitration of each decided conflict (a veto cancels it). */
export async function arbitratedPrecedences(q: Q): Promise<[string, string][]> {
  const rows = await q.select({ a: arbitrations, status: conflicts.status }).from(arbitrations).innerJoin(conflicts, eq(conflicts.id, arbitrations.conflictId)).orderBy(arbitrations.decidedAt);
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) latest.set(r.a.conflictId, r);
  const out: [string, string][] = [];
  for (const r of latest.values()) {
    if (r.status !== 'decided' || r.a.kind !== 'decision') continue;
    for (let i = 0; i + 1 < r.a.order.length; i++) out.push([r.a.order[i], r.a.order[i + 1]]);
  }
  return out;
}

export interface EngineContext {
  input: EngineInput;
  ruleVersion: number;
  resourceCode: Map<string, string>;
}

export async function engineInput(q: Q, today: string, now: Date): Promise<EngineContext> {
  const fromOn = addDaysIso(today, 1);
  const toOn = addDaysIso(today, 7 * ENGINE_WEEKS);
  const from = parisInstant(fromOn, '00:00');
  const to = parisInstant(toOn, '00:00');
  const [res, facs, rules, rs, precedences] = await Promise.all([
    q.select().from(resources).where(ne(resources.status, 'retired')),
    q.select({ code: facilities.code }).from(facilities),
    rulesOf(q),
    currentRuleSet(q),
    arbitratedPrecedences(q),
  ]);
  const ids = res.map((r) => r.id);
  const cal = await calendarsOf(q, facs.map((f) => f.code));
  for (const c of cal.values()) if (!c.hours.length) c.hours = [...DEFAULT_HOURS];
  const [unav, insp, held, needRows, ppl, sk, abs, tts, tte, subs, maint] = await Promise.all([
    ids.length ? q.select().from(unavailabilities).where(and(inArray(unavailabilities.resourceId, ids), lt(unavailabilities.startsAt, to), gte(unavailabilities.endsAt, from))) : [],
    q.select().from(inspections).where(eq(inspections.active, true)),
    q.select({ b: bookings, code: resources.code }).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId))
      .where(and(inArray(bookings.status, [...HOLDING]), lt(bookings.startsAt, to), gte(bookings.endsAt, parisInstant(today, '00:00')))),
    q.select({ n: testNeeds, priorityClass: projects.priorityClass, entityCode: projects.entityCode, criticality: projectMilestones.criticality })
      .from(testNeeds).innerJoin(projects, eq(projects.code, testNeeds.projectCode)).leftJoin(projectMilestones, eq(projectMilestones.id, testNeeds.milestoneId))
      .where(and(eq(testNeeds.status, 'open'), gte(testNeeds.deadlineOn, addDaysIso(today, -365)), eq(projects.active, true))),
    q.select().from(people).where(eq(people.active, true)),
    q.select().from(personSkills),
    q.select().from(personAbsences).where(gte(personAbsences.toOn, today)),
    q.select().from(testTypeSkills),
    q.select().from(testTypeEquipment),
    q.select().from(substitutions).where(eq(substitutions.status, 'validated')),
    q.select().from(maintenancePlans).where(and(eq(maintenancePlans.active, true), eq(maintenancePlans.blocking, true))),
  ]);
  const heldIds = held.map((h) => h.b.id);
  const [staffRows, equipRows, linked] = await Promise.all([
    heldIds.length ? q.select().from(bookingStaff).where(inArray(bookingStaff.bookingId, heldIds)) : [],
    heldIds.length ? q.select().from(bookingEquipment).where(inArray(bookingEquipment.bookingId, heldIds)) : [],
    needRows.length ? q.select({ resourceId: bookings.resourceId, start: bookings.startsAt, end: bookings.endsAt, status: bookings.status, needId: bookings.needId }).from(bookings)
      .where(and(inArray(bookings.needId, needRows.map((n) => n.n.id)), ne(bookings.status, 'cancelled'))) : [],
  ]);
  const interval = new Map(held.map((h) => [h.b.id, { start: ms(h.b.startsAt), end: ms(h.b.endsAt) }]));
  // What is left of each need: its half-days minus the hours its bookings (held or requested) cover (as the load forecast).
  const coverage = loadForecast({
    weeks: [], today, rules: [], calendars: cal,
    resources: res.map((r) => ({ id: r.id, code: r.code, facilityCode: r.facilityCode, capacity: r.capacity })),
    unavailabilities: unav.map((u) => ({ resourceId: u.resourceId, start: ms(u.startsAt), end: ms(u.endsAt) })),
    bookings: linked.map((b) => ({ ...b, start: ms(b.start), end: ms(b.end) })),
    needs: needRows.map((x) => ({ id: x.n.id, ref: x.n.ref, projectCode: x.n.projectCode, resourceId: x.n.resourceId, level: x.n.level, halfDays: x.n.halfDays, earliestOn: x.n.earliestOn, deadlineOn: x.n.deadlineOn })),
  }).needs;
  const left = new Map(coverage.map((c) => [c.id, c.remainingHalfDays]));
  const facilityOf = new Map(res.map((r) => [r.id, r.facilityCode]));
  const input: EngineInput = {
    today, now: now.getTime(), fromOn, toOn,
    resources: res.map((r) => ({
      id: r.id, code: r.code, facilityCode: r.facilityCode, capacity: r.capacity, status: r.status, granularity: r.granularity,
      limits: { bufferMinutes: r.bufferMinutes, minNoticeHours: r.minNoticeHours, maxDays: r.maxDays },
    })),
    calendars: cal,
    unavailabilities: unav.map((u) => ({ resourceId: u.resourceId, start: ms(u.startsAt), end: ms(u.endsAt), label: u.label })),
    inspections: insp.map((i) => ({ resourceId: i.resourceId, label: i.label, dueOn: inspectionDueOn(i.lastOn, i.periodMonths) })),
    maintenance: maint.map((m) => ({ resourceId: m.resourceId, label: m.label, dueOn: maintenanceDueOn(m) })),
    bookings: held.map((h) => ({ id: h.b.id, ref: h.b.ref, resourceId: h.b.resourceId, resourceCode: h.code, start: ms(h.b.startsAt), end: ms(h.b.endsAt), status: h.b.status })),
    rules: rules.filter((r) => r.status !== 'retired').map((r) => ({ code: r.code, maxActive: r.maxActive, status: r.status, resourceIds: r.resourceIds })),
    needs: needRows.map((x) => ({
      id: x.n.id, ref: x.n.ref, projectCode: x.n.projectCode, entityCode: x.entityCode, priorityClass: x.priorityClass, criticality: x.criticality ?? null,
      resourceId: x.n.resourceId, testTypeCode: x.n.testTypeCode, earliestOn: x.n.earliestOn, deadlineOn: x.n.deadlineOn, requestedAt: ms(x.n.requestedAt),
      remainingHalfDays: left.get(x.n.id) ?? x.n.halfDays,
    })).filter((n) => facilityOf.has(n.resourceId)),
    people: ppl.map((p) => ({
      id: p.id, name: p.name, facilityCodes: p.facilityCodes,
      skills: sk.filter((s) => s.personId === p.id).map((s) => ({ code: s.skillCode, validUntil: s.validUntil })),
      absences: abs.filter((a) => a.personId === p.id).map((a) => ({ fromOn: a.fromOn, toOn: a.toOn })),
    })),
    staffBusy: staffRows.map((s) => ({ personId: s.personId, ...interval.get(s.bookingId)! })),
    equipmentBusy: equipRows.map((e) => ({ code: e.equipmentCode, ...interval.get(e.bookingId)! })),
    testTypes: new Map([...new Set([...tts.map((x) => x.testTypeCode), ...tte.map((x) => x.testTypeCode)])].map((code) => [code, {
      skills: tts.filter((x) => x.testTypeCode === code).map((x) => ({ code: x.skillCode, count: x.count })),
      equipment: tte.filter((x) => x.testTypeCode === code).map((x) => x.equipmentCode),
    }])),
    substitutes: new Map([...new Set(subs.map((s) => s.testTypeCode))].map((code) => [code, subs.filter((s) => s.testTypeCode === code).map((s) => s.resourceId)])),
    criteria: rs.criteria,
    precedences,
  };
  return { input, ruleVersion: rs.version, resourceCode: new Map(res.map((r) => [r.id, r.code])) };
}

async function nextRef(tx: Tx, prefix: 'R' | 'C', table: typeof planRuns | typeof conflicts, year: string): Promise<string> {
  const [last] = await tx.select({ ref: table.ref }).from(table).where(like(table.ref, `${prefix}-${year}-%`)).orderBy(desc(table.ref)).limit(1);
  const n = last ? Number(last.ref.slice(7)) + 1 : 1;
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

export interface RunBy {
  name: string;
  userId: string | null;
  role: string | null;
}

/** Runs the engine and records the run, its proposals and its conflict sheets. */
export async function runEngine(tx: Tx, opts: { trigger: 'manual' | 'nightly'; by: RunBy; today: string; now: Date }): Promise<{ runId: string; ref: string; result: EngineResult; conflicts: number }> {
  const ctx = await engineInput(tx, opts.today, opts.now);
  const result = proposePlan(ctx.input);
  const sheets = detectConflicts(ctx.input, result, { resourceCode: (id) => ctx.resourceCode.get(id) ?? id });
  const year = parisParts(opts.now).iso.slice(0, 4);
  const ref = await nextRef(tx, 'R', planRuns, year);
  const summary = {
    needs: ctx.input.needs.filter((n) => n.remainingHalfDays > 0).length, proposals: result.proposals.length, late: result.proposals.filter((p) => p.lateDays > 0).length,
    substitutes: result.proposals.filter((p) => p.substitute).length, unplaced: result.unplaced, conflicts: sheets.length,
  };
  const [run] = await tx.insert(planRuns).values({
    ref, ruleVersion: ctx.ruleVersion, fromOn: ctx.input.fromOn, toOn: ctx.input.toOn, trigger: opts.trigger, runByName: opts.by.name, runAt: opts.now, summary,
  }).returning({ id: planRuns.id });
  await tx.update(proposals).set({ status: 'superseded' }).where(eq(proposals.status, 'proposed'));
  if (result.proposals.length) {
    await tx.insert(proposals).values(result.proposals.map((p) => ({
      runId: run.id, needId: p.needId, resourceId: p.resourceId, startsAt: new Date(p.start), endsAt: new Date(p.end), substitute: p.substitute, lateDays: p.lateDays,
      staff: p.staff, equipment: p.equipment, explanation: { rank: p.rank, criteria: p.criteria, ruleVersion: ctx.ruleVersion },
    })));
  }
  const open = await tx.select().from(conflicts).where(inArray(conflicts.status, ['open', 'vetoed']));
  // A decided conflict stands: the engine applied the decision; the same needs found again are not a new conflict.
  const decided = new Set((await tx.select({ needIds: conflicts.needIds }).from(conflicts).where(eq(conflicts.status, 'decided'))).map((c) => c.needIds.slice().sort().join(',')));
  const seen = new Set<string>();
  for (const s of sheets) {
    const key = s.needIds.join(',');
    seen.add(key);
    if (decided.has(key)) continue;
    const values = {
      runId: run.id, subject: s.subject, options: s.options as unknown as Record<string, unknown>[], recommendedKey: s.recommendedKey,
      ruleCited: s.criterion ?? 'tie', ruleRank: s.rank, ruleVersion: ctx.ruleVersion, decider: s.critical ? 'rd_director' : 'coordinator', updatedAt: new Date(),
    };
    const existing = open.find((c) => c.needIds.slice().sort().join(',') === key);
    if (existing) await tx.update(conflicts).set(values).where(eq(conflicts.id, existing.id));
    else {
      const cref = await nextRef(tx, 'C', conflicts, year);
      await tx.insert(conflicts).values({ ...values, ref: cref, needIds: s.needIds, dueOn: conflictDueOn(opts.today) });
      // F-8: the deciders learn of a new conflict (A-4: the coordinators, and the R&D director when a critical need is at stake).
      const deciders = [...await usersWithRole(tx, ['coordinator']), ...(s.critical ? await usersWithRole(tx, ['rd_director']) : [])];
      await notify(tx, deciders, { kind: 'conflict', title: `Conflict to arbitrate · ${cref} · ${s.subject}`, href: '/conflicts' }, { except: opts.by.userId, at: opts.now });
    }
  }
  const gone = open.filter((c) => c.status === 'open' && !seen.has(c.needIds.slice().sort().join(',')));
  if (gone.length) await tx.update(conflicts).set({ status: 'obsolete', updatedAt: new Date() }).where(inArray(conflicts.id, gone.map((c) => c.id)));
  await writeAudit(tx, {
    actorName: opts.by.name, actorUserId: opts.by.userId, actorRole: opts.by.role, objectRef: `Run ${ref}`, area: 'Planning',
    change: `engine run (${opts.trigger}): ${result.proposals.length} proposals, ${sheets.length} conflicts, ${result.unplaced.length} not placed`,
    after: { ruleVersion: ctx.ruleVersion, ...summary },
  });
  return { runId: run.id, ref, result, conflicts: sheets.length };
}
