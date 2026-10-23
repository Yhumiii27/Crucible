import 'server-only';
// The pilot (docs/PILOTE.md; decisions P-3, X-2, F-9): its settings (app_settings `crucible.pilot`, set by the R&D director),
// the checklist of its start computed from what is recorded, and the reference measure — the period before the start (the
// history imported) against the pilot period so far, per facility of the pilot the viewer sees. Computed, never stored.
import { and, countDistinct, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { parsePilotSettings, pilotPeriods, PILOT_SETTING_KEY, readiness, type PilotSettings, type ReadinessFacts } from '@/domain/pilot';
import { isLateRequest, DEFAULT_NOTICE_WORKDAYS } from '@/domain/needs';
import { rateOf, sumUsage, waitingByEntity, type ResourceUsage } from '@/domain/utilisation';
import { parisInstant, parisParts } from '@/lib/dates';
import { authMode } from '@/server/auth/config';
import { getDb } from '@/server/db/client';
import {
  appSettings, bookings, exclusionRuleResources, exclusionRules, facilities, inspections, personSkills, projectMilestones, resources, roleAssignments,
} from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import type { Viewer } from '@/server/viewer';
import { resourceUsages, usageFacts } from './resources';
import { visibleFacilities } from './visibility';

export async function readPilot(q?: DB | Tx): Promise<PilotSettings | null> {
  const db = q ?? (await getDb());
  const [row] = await db.select({ v: appSettings.value }).from(appSettings).where(eq(appSettings.key, PILOT_SETTING_KEY));
  return row ? parsePilotSettings(row.v) : null;
}

/** The active facilities (codes and names) a pilot may cover. */
export async function activeFacilities(q?: DB | Tx) {
  const db = q ?? (await getDb());
  return db.select({ code: facilities.code, name: facilities.name }).from(facilities).where(eq(facilities.active, true)).orderBy(facilities.code);
}

/** The checklist of the start, on the pilot facilities. */
export async function pilotReadiness(s: PilotSettings) {
  const db = await getDb();
  const codes = s.facilities;
  const res = await db.select({ id: resources.id, facilityCode: resources.facilityCode }).from(resources).where(and(inArray(resources.facilityCode, codes), ne(resources.status, 'retired')));
  const ids = res.map((r) => r.id);
  const [roles, rules, insp, skilled, withMilestones, history] = await Promise.all([
    db.select({ role: roleAssignments.role, scopeRef: roleAssignments.scopeRef }).from(roleAssignments),
    ids.length
      ? db.select({ facilityCode: resources.facilityCode, n: countDistinct(exclusionRules.id) }).from(exclusionRules)
        .innerJoin(exclusionRuleResources, eq(exclusionRuleResources.ruleId, exclusionRules.id)).innerJoin(resources, eq(resources.id, exclusionRuleResources.resourceId))
        .where(and(eq(exclusionRules.status, 'validated'), inArray(resources.id, ids))).groupBy(resources.facilityCode)
      : [],
    ids.length
      ? db.select({ facilityCode: resources.facilityCode, n: sql<number>`count(*)::int` }).from(inspections).innerJoin(resources, eq(resources.id, inspections.resourceId))
        .where(and(eq(inspections.active, true), inArray(resources.id, ids))).groupBy(resources.facilityCode)
      : [],
    db.select({ n: countDistinct(personSkills.personId) }).from(personSkills),
    db.select({ n: countDistinct(projectMilestones.projectCode) }).from(projectMilestones),
    ids.length
      ? (() => {
        const p = pilotPeriods(s, s.startOn).baseline;
        return db.select({ n: sql<number>`count(*)::int` }).from(bookings)
          .where(and(inArray(bookings.resourceId, ids), eq(bookings.source, 'import'), gte(bookings.startsAt, parisInstant(p.from, '00:00')), lt(bookings.startsAt, parisInstant(p.to, '00:00'))));
      })()
      : [{ n: 0 }],
  ]);
  const facts: ReadinessFacts = {
    facilities: codes.map((code) => ({
      code,
      resources: res.filter((r) => r.facilityCode === code).length,
      managers: roles.filter((r) => r.role === 'facility_manager' && r.scopeRef === code).length,
      technicians: roles.filter((r) => r.role === 'technician' && r.scopeRef === code).length,
      rules: Number(rules.find((r) => r.facilityCode === code)?.n ?? 0),
      inspections: Number(insp.find((r) => r.facilityCode === code)?.n ?? 0),
    })),
    coordinators: roles.filter((r) => r.role === 'coordinator' && (r.scopeRef == null || codes.includes(r.scopeRef))).length,
    safetyOfficers: roles.filter((r) => r.role === 'safety').length,
    peopleWithSkills: Number(skilled[0]?.n ?? 0),
    projectsWithMilestones: Number(withMilestones[0]?.n ?? 0),
    historyBookings: Number(history[0]?.n ?? 0),
    entra: authMode() === 'entra',
  };
  return readiness(facts);
}

export interface PeriodMeasure {
  from: string;
  /** Excluded. */
  to: string;
  usage: ResourceUsage;
  /** Bookings starting in the period that held the resource. */
  bookings: number;
  averageWaitDays: number | null;
  lateRequests: number;
}

const isoOf = (ms: number) => parisParts(new Date(ms)).iso;

/** One period on the pilot facilities the viewer sees, per facility and in all. */
async function measure(viewer: Viewer, codes: readonly string[], from: string, to: string): Promise<{ byFacility: Map<string, PeriodMeasure>; all: PeriodMeasure }> {
  const f = await usageFacts(viewer, from, to, { fromIso: from, toIso: to });
  const usage = resourceUsages(f, from, to);
  const noticeOf = (facilityCode: string, entityCode: string) => f.agreements.find((a) => a.facilityCode === facilityCode && a.entityCode === entityCode)?.noticeWorkdays ?? DEFAULT_NOTICE_WORKDAYS;
  const of = (facilityCodes: readonly string[]): PeriodMeasure => {
    const res = f.resources.filter((r) => facilityCodes.includes(r.facilityCode));
    const bk = f.bookings.filter((b) => facilityCodes.includes(b.facilityCode) && b.start >= f.period.start && b.start < f.period.end);
    // Imported history carries no request date of its own: never counted late, and its wait is not measured (F-9).
    const asked = bk.filter((b) => b.source !== 'import');
    const waits = waitingByEntity(asked.map((b) => ({ ...b, late: isLateRequest(isoOf(b.requestedAt), isoOf(b.start), noticeOf(b.facilityCode, b.entityCode)) })));
    const n = waits.reduce((s, w) => s + w.count, 0);
    return {
      from, to, usage: sumUsage(res.map((r) => usage.get(r.id)!)),
      bookings: bk.filter((b) => ['confirmed', 'in_progress', 'done', 'no_show'].includes(b.status)).length,
      averageWaitDays: n ? Math.round((10 * waits.reduce((s, w) => s + w.averageDays * w.count, 0)) / n) / 10 : null,
      lateRequests: waits.reduce((s, w) => s + w.late, 0),
    };
  };
  const visible = codes.filter((c) => f.facilities.some((x) => x.code === c));
  return { byFacility: new Map(visible.map((c) => [c, of([c])])), all: of(visible) };
}

/** The reference period against the pilot period so far (X-2); the pilot is null before the start. */
export async function pilotComparison(viewer: Viewer, s: PilotSettings, today: string) {
  const p = pilotPeriods(s, today);
  const facs = (await visibleFacilities(viewer)).filter((f) => s.facilities.includes(f.code));
  const codes = facs.map((f) => f.code);
  const [baseline, pilot] = await Promise.all([
    measure(viewer, codes, p.baseline.from, p.baseline.to),
    p.pilot ? measure(viewer, codes, p.pilot.from, p.pilot.to) : Promise.resolve(null),
  ]);
  return { facilities: facs.map((f) => ({ code: f.code, name: f.name })), baseline, pilot };
}

/** A rate of a measure: realised with preparation, booked, blocked (P-5). */
export const rates = (m: PeriodMeasure) => ({
  realisedWithPrep: rateOf(m.usage.realisedWithPrepHours, m.usage.netOpenHours),
  booked: rateOf(m.usage.bookedHours, m.usage.netOpenHours),
  blocked: rateOf(m.usage.blockedHours, m.usage.netOpenHours),
});
