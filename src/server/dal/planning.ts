import 'server-only';
// Reads of delivery 4 (docs/spec/05 "Proposer", "Conflits", personnes): people and their skills, the latest engine run with its
// proposals and the needs it could not place, the conflict sheets with their options and decisions, substitutions, priority
// rules, test type requirements and mobile equipment. What a need is for is shown only to those who see its project (U-3):
// otherwise its reference, entity and resource only.
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { canSeeProject, projectVisibility } from '@/domain/rights';
import { getDb } from '@/server/db/client';
import {
  arbitrations, conflicts, mobileEquipment, people, personAbsences, personSkills, planRuns, priorityRuleSets, projects, proposals, resources, skills, substitutions, testNeeds,
  testTypeEquipment, testTypeSkills, testTypes,
} from '@/server/db/schema';
import type { Viewer } from '@/server/viewer';
import { currentRuleSet } from '@/server/planning/engine-run';
import { visibleFacilities } from './visibility';

/** How a need shows to the viewer: its project and purpose, or only that it exists. */
async function needLabels(viewer: Viewer, ids: readonly string[]) {
  if (!ids.length) return new Map<string, { ref: string; projectCode: string | null; title: string | null; entityCode: string; confidential: boolean; deadlineOn: string }>();
  const db = await getDb();
  const rows = await db.select({ n: testNeeds, entityCode: projects.entityCode, confidential: projects.confidential }).from(testNeeds)
    .innerJoin(projects, eq(projects.code, testNeeds.projectCode)).where(inArray(testNeeds.id, [...ids]));
  const pv = projectVisibility(viewer.role, viewer.assignments);
  return new Map(rows.map((r) => {
    const open = canSeeProject(pv, { code: r.n.projectCode, entityCode: r.entityCode, confidential: r.confidential });
    return [r.n.id, { ref: r.n.ref, projectCode: open ? r.n.projectCode : null, title: open ? r.n.title : null, entityCode: r.entityCode, confidential: r.confidential, deadlineOn: r.n.deadlineOn }];
  }));
}

/** People, their skills and absences to come, the skill catalogue. */
export async function peopleScreen(today: string) {
  const db = await getDb();
  const [ppl, sk, abs, cat] = await Promise.all([
    db.select().from(people).where(eq(people.active, true)).orderBy(asc(people.name)),
    db.select().from(personSkills),
    db.select().from(personAbsences).where(gte(personAbsences.toOn, today)).orderBy(asc(personAbsences.fromOn)),
    db.select().from(skills).orderBy(asc(skills.code)),
  ]);
  return {
    people: ppl.map((p) => ({ ...p, skills: sk.filter((s) => s.personId === p.id), absences: abs.filter((a) => a.personId === p.id) })),
    skills: cat,
  };
}

/** The latest run of the engine, its proposals and the needs it could not place. */
export async function proposeScreen(viewer: Viewer) {
  const db = await getDb();
  const [run] = await db.select().from(planRuns).orderBy(desc(planRuns.runAt)).limit(1);
  const rules = await currentRuleSet(db);
  if (!run) return { run: null, proposals: [], unplaced: [], rules, needs: new Map(), people: new Map<string, string>() };
  const rows = await db.select({ p: proposals, resourceCode: resources.code, facilityCode: resources.facilityCode }).from(proposals)
    .innerJoin(resources, eq(resources.id, proposals.resourceId)).where(eq(proposals.runId, run.id)).orderBy(asc(proposals.startsAt));
  const unplaced = (run.summary.unplaced as { needId: string; needRef: string; reason: string }[] | undefined) ?? [];
  const needs = await needLabels(viewer, [...rows.map((r) => r.p.needId), ...unplaced.map((u) => u.needId)]);
  const ppl = await db.select({ id: people.id, name: people.name }).from(people);
  return { run, proposals: rows, unplaced, rules, needs, people: new Map(ppl.map((p) => [p.id, p.name])) };
}

export interface OptionView {
  key: string;
  orderRefs: string[];
  outcomes: { needId: string; needRef: string; resourceId: string | null; start: number | null; end: number | null; substitute: boolean; lateDays: number | null }[];
}

/** Conflict sheets, open first, with their options, the needs as the viewer may see them, and their decisions. */
export async function conflictsScreen(viewer: Viewer) {
  const db = await getDb();
  const rows = await db.select().from(conflicts).orderBy(asc(conflicts.status), desc(conflicts.createdAt));
  const ids = [...new Set(rows.flatMap((c) => c.needIds))];
  const [needs, res, decisions] = await Promise.all([
    needLabels(viewer, ids),
    db.select({ id: resources.id, code: resources.code }).from(resources),
    rows.length ? db.select().from(arbitrations).where(inArray(arbitrations.conflictId, rows.map((c) => c.id))).orderBy(asc(arbitrations.decidedAt)) : [],
  ]);
  return {
    conflicts: rows.map((c) => ({ ...c, options: c.options as unknown as OptionView[], decisions: decisions.filter((d) => d.conflictId === c.id) })),
    needs,
    resourceCode: new Map(res.map((r) => [r.id, r.code])),
  };
}

/** Substitutions, priority rule versions, test type requirements, skills and equipment (the rules screen). */
export async function planningRules() {
  const db = await getDb();
  const [subs, versions, tts, tte, sk, eqp, types] = await Promise.all([
    db.select({ s: substitutions, resourceCode: resources.code, facilityCode: resources.facilityCode }).from(substitutions).innerJoin(resources, eq(resources.id, substitutions.resourceId))
      .orderBy(asc(substitutions.testTypeCode), asc(resources.code)),
    db.select().from(priorityRuleSets).orderBy(desc(priorityRuleSets.version)),
    db.select().from(testTypeSkills),
    db.select().from(testTypeEquipment),
    db.select().from(skills).where(eq(skills.active, true)).orderBy(asc(skills.code)),
    db.select().from(mobileEquipment).where(eq(mobileEquipment.active, true)).orderBy(asc(mobileEquipment.code)),
    db.select({ code: testTypes.code }).from(testTypes).where(eq(testTypes.active, true)).orderBy(asc(testTypes.code)),
  ]);
  return {
    substitutions: subs, versions, skills: sk, equipment: eqp,
    requirements: new Map(types.map((x) => [x.code, { skills: tts.filter((s) => s.testTypeCode === x.code), equipment: tte.filter((e) => e.testTypeCode === x.code).map((e) => e.equipmentCode) }])),
  };
}

/** Mobile equipment kept by a facility the viewer sees. */
export async function facilityEquipment(viewer: Viewer, code: string) {
  if (!(await visibleFacilities(viewer)).some((f) => f.code === code)) return [];
  const db = await getDb();
  return db.select().from(mobileEquipment).where(and(eq(mobileEquipment.facilityCode, code), eq(mobileEquipment.active, true))).orderBy(asc(mobileEquipment.code));
}

/** Open proposals of the latest run for needs of the given projects ("slots proposed" of My test needs). */
export async function proposalsForProjects(projectCodes: readonly string[]) {
  if (!projectCodes.length) return [];
  const db = await getDb();
  const [run] = await db.select({ id: planRuns.id }).from(planRuns).orderBy(desc(planRuns.runAt)).limit(1);
  if (!run) return [];
  return db.select({ p: proposals, needRef: testNeeds.ref, resourceCode: resources.code }).from(proposals)
    .innerJoin(testNeeds, eq(testNeeds.id, proposals.needId)).innerJoin(resources, eq(resources.id, proposals.resourceId))
    .where(and(eq(proposals.runId, run.id), eq(proposals.status, 'proposed'), inArray(testNeeds.projectCode, [...projectCodes]))).orderBy(asc(proposals.startsAt));
}
