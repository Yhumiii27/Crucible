import 'server-only';
// Reads of delivery 3 (docs/spec/02 §3, 03 §6, 05): the project sheet (milestones, needs, bookings), "My test needs", the load
// forecast and the test type catalogue. Projects are read through the visibility rules (src/server/dal/visibility.ts): a
// project outside the viewer's visibility does not exist; in the load forecast, a need of a project the viewer may not see
// shows its entity only (U-3). Coverage, lateness and load are computed here from the rows, never stored.
import { and, asc, eq, gte, inArray, lt, ne, or } from 'drizzle-orm';
import { inspectionDueOn, mondayOf } from '@/domain/calendar';
import { loadForecast, loadSignals, type LoadInput, type NeedSpread } from '@/domain/load';
import { DEFAULT_NOTICE_WORKDAYS, isLateRequest, type NeedLevel, type NeedStatus } from '@/domain/needs';
import { canManageNeeds, canSeeProject, projectVisibility } from '@/domain/rights';
import type { BookingStatus } from '@/domain/resources';
import { addDaysIso, parisInstant, parisParts } from '@/lib/dates';
import { getDb } from '@/server/db/client';
import { bookings, entityAgreements, inspections, projectMilestones, projects, resources, testNeeds, testTypes, unavailabilities } from '@/server/db/schema';
import type { DB } from '@/server/db/types';
import type { Viewer } from '@/server/viewer';
import { calendarsOf, rulesOf } from './resources';
import { projectForViewer, visibleFacilities, visibleProjects, type FacilityRow } from './visibility';

const ms = (d: Date) => d.getTime();

export interface NeedRow {
  id: string;
  ref: string;
  projectCode: string;
  level: NeedLevel;
  status: NeedStatus;
  title: string;
  resourceId: string;
  resourceCode: string;
  facilityCode: string;
  halfDays: number;
  earliestOn: string;
  deadlineOn: string;
  milestoneId: string | null;
  milestoneLabel: string | null;
  testTypeCode: string | null;
  codexRef: string | null;
  note: string | null;
  requestedByName: string;
  requestedOn: string;
  withdrawnReason: string | null;
  /** A request made with less notice than agreed (F-5). */
  late: boolean;
  spread: NeedSpread | null;
}

/** Loads needs with their resource, milestone, coverage by their bookings and lateness. */
async function needRows(db: DB, where: ReturnType<typeof and>, today: string): Promise<NeedRow[]> {
  const rows = await db
    .select({ n: testNeeds, resourceCode: resources.code, facilityCode: resources.facilityCode, capacity: resources.capacity, milestoneLabel: projectMilestones.label, entityCode: projects.entityCode })
    .from(testNeeds)
    .innerJoin(resources, eq(resources.id, testNeeds.resourceId))
    .innerJoin(projects, eq(projects.code, testNeeds.projectCode))
    .leftJoin(projectMilestones, eq(projectMilestones.id, testNeeds.milestoneId))
    .where(where)
    .orderBy(asc(testNeeds.deadlineOn), asc(testNeeds.ref));
  if (!rows.length) return [];
  const facilityCodes = [...new Set(rows.map((r) => r.facilityCode))];
  const resourceIds = [...new Set(rows.map((r) => r.n.resourceId))];
  const [cal, unav, linked, agreements] = await Promise.all([
    calendarsOf(db, facilityCodes),
    db.select().from(unavailabilities).where(inArray(unavailabilities.resourceId, resourceIds)),
    db.select({ resourceId: bookings.resourceId, start: bookings.startsAt, end: bookings.endsAt, status: bookings.status, needId: bookings.needId }).from(bookings)
      .where(inArray(bookings.needId, rows.map((r) => r.n.id))),
    db.select().from(entityAgreements).where(inArray(entityAgreements.facilityCode, facilityCodes)),
  ]);
  const spreads = loadForecast({
    weeks: [], today,
    resources: rows.filter((r, i, xs) => xs.findIndex((x) => x.n.resourceId === r.n.resourceId) === i).map((r) => ({ id: r.n.resourceId, code: r.resourceCode, facilityCode: r.facilityCode, capacity: r.capacity })),
    calendars: cal, rules: [],
    unavailabilities: unav.map((u) => ({ resourceId: u.resourceId, start: ms(u.startsAt), end: ms(u.endsAt) })),
    bookings: linked.map((b) => ({ ...b, start: ms(b.start), end: ms(b.end) })),
    needs: rows.map((r) => ({ id: r.n.id, ref: r.n.ref, projectCode: r.n.projectCode, resourceId: r.n.resourceId, level: r.n.level, halfDays: r.n.halfDays, earliestOn: r.n.earliestOn, deadlineOn: r.n.deadlineOn })),
  }).needs;
  const spreadOf = new Map(spreads.map((s) => [s.id, s]));
  return rows.map((r) => {
    const notice = agreements.find((a) => a.facilityCode === r.facilityCode && a.entityCode === r.entityCode)?.noticeWorkdays ?? DEFAULT_NOTICE_WORKDAYS;
    const requestedOn = parisParts(r.n.requestedAt).iso;
    return {
      id: r.n.id, ref: r.n.ref, projectCode: r.n.projectCode, level: r.n.level, status: r.n.status, title: r.n.title, resourceId: r.n.resourceId, resourceCode: r.resourceCode,
      facilityCode: r.facilityCode, halfDays: r.n.halfDays, earliestOn: r.n.earliestOn, deadlineOn: r.n.deadlineOn, milestoneId: r.n.milestoneId, milestoneLabel: r.milestoneLabel,
      testTypeCode: r.n.testTypeCode, codexRef: r.n.codexRef, note: r.n.note, requestedByName: r.n.requestedByName, requestedOn, withdrawnReason: r.n.withdrawnReason,
      late: r.n.level === 'request' && isLateRequest(requestedOn, r.n.earliestOn, notice),
      spread: r.n.status === 'open' ? spreadOf.get(r.n.id) ?? null : null,
    };
  });
}

export interface ResourceChoice {
  id: string;
  code: string;
  name: string;
  facilityCode: string;
  granularity: 'half_day' | 'hour';
}

/** Resources of the visible facilities (not retired), and the active test types: what a need may refer to. */
async function needChoices(db: DB, facilities: readonly FacilityRow[]) {
  const codes = facilities.map((f) => f.code);
  const [res, types] = await Promise.all([
    codes.length ? db.select().from(resources).where(and(inArray(resources.facilityCode, codes), ne(resources.status, 'retired'))).orderBy(asc(resources.facilityCode), asc(resources.code)) : [],
    db.select().from(testTypes).where(eq(testTypes.active, true)).orderBy(asc(testTypes.code)),
  ]);
  return {
    resources: res.map((r): ResourceChoice => ({ id: r.id, code: r.code, name: r.name, facilityCode: r.facilityCode, granularity: r.granularity })),
    testTypes: types.map((x) => ({ code: x.code, name: x.name, nominalResourceId: x.nominalResourceId, typicalHalfDays: x.typicalHalfDays })),
  };
}

export interface ProjectBooking {
  id: string;
  ref: string;
  resourceCode: string;
  facilityCode: string;
  start: number;
  end: number;
  status: BookingStatus;
  title: string;
  needRef: string | null;
  codexRef: string | null;
}

/** The project sheet: milestones, needs, bookings; null when the project does not exist for the viewer. */
export async function projectSheet(viewer: Viewer, code: string, today: string) {
  const project = await projectForViewer(viewer, code);
  if (!project) return null;
  const db = await getDb();
  const facilities = await visibleFacilities(viewer);
  const [milestones, needs, rows, choices] = await Promise.all([
    db.select().from(projectMilestones).where(eq(projectMilestones.projectCode, code)).orderBy(asc(projectMilestones.dueOn)),
    needRows(db, eq(testNeeds.projectCode, code), today),
    db.select({ b: bookings, resourceCode: resources.code, facilityCode: resources.facilityCode, needRef: testNeeds.ref }).from(bookings)
      .innerJoin(resources, eq(resources.id, bookings.resourceId)).leftJoin(testNeeds, eq(testNeeds.id, bookings.needId))
      .where(and(eq(bookings.projectCode, code), ne(bookings.status, 'cancelled'))).orderBy(asc(bookings.startsAt)),
    needChoices(db, facilities),
  ]);
  // A project the viewer sees in full may still have bookings on a facility the viewer does not see (a partner's project on the PDE): not listed.
  const seen = new Set(facilities.map((f) => f.code));
  return {
    project,
    manage: canManageNeeds(viewer.role, viewer.assignments, project),
    milestones,
    needs,
    bookings: rows.filter((r) => seen.has(r.facilityCode)).map((r): ProjectBooking => ({
      id: r.b.id, ref: r.b.ref, resourceCode: r.resourceCode, facilityCode: r.facilityCode, start: ms(r.b.startsAt), end: ms(r.b.endsAt), status: r.b.status,
      title: r.b.title, needRef: r.needRef, codexRef: r.b.codexRef,
    })),
    choices,
  };
}

/** "My test needs": the projects whose needs the viewer enters, their milestones and open needs. */
export async function myNeeds(viewer: Viewer, today: string) {
  const db = await getDb();
  const projs = (await visibleProjects(viewer)).filter((p) => canManageNeeds(viewer.role, viewer.assignments, p));
  const codes = projs.map((p) => p.code);
  if (!codes.length) return { projects: [], milestones: [], needs: [], choices: { resources: [], testTypes: [] } };
  const [milestones, needs, choices] = await Promise.all([
    db.select().from(projectMilestones).where(inArray(projectMilestones.projectCode, codes)).orderBy(asc(projectMilestones.dueOn)),
    needRows(db, and(inArray(testNeeds.projectCode, codes), eq(testNeeds.status, 'open')), today),
    needChoices(db, await visibleFacilities(viewer)),
  ]);
  return { projects: projs, milestones, needs, choices };
}

/** Open needs of projects, for the request form (the need a booking serves). */
export async function openNeedsOf(projectCodes: readonly string[]) {
  if (!projectCodes.length) return [];
  const db = await getDb();
  return db.select({ id: testNeeds.id, ref: testNeeds.ref, projectCode: testNeeds.projectCode, title: testNeeds.title }).from(testNeeds)
    .where(and(inArray(testNeeds.projectCode, [...projectCodes]), eq(testNeeds.status, 'open'))).orderBy(asc(testNeeds.ref));
}

/** The test type catalogue, with the nominal resource's code. */
export async function testTypeCatalogue() {
  const db = await getDb();
  return db.select({ t: testTypes, resourceCode: resources.code }).from(testTypes).leftJoin(resources, eq(resources.id, testTypes.nominalResourceId)).orderBy(asc(testTypes.code));
}

/** Weeks of the load forecast: the detailed horizon (26 weeks, F-6) and the 12-month envelopes. */
export const DETAIL_WEEKS = 26;
export const ENVELOPE_WEEKS = 52;

/**
 * The load forecast of the visible facilities over 52 weeks from this week: resources, validated rules, bookings, open needs.
 * Needs of projects the viewer may not see keep their reference, resource and entity only.
 */
export async function loadScreen(viewer: Viewer, today: string) {
  const db = await getDb();
  const facilities = await visibleFacilities(viewer);
  const codes = facilities.map((f) => f.code);
  const monday = mondayOf(today);
  const weeks = Array.from({ length: ENVELOPE_WEEKS }, (_, i) => addDaysIso(monday, 7 * i));
  const res = codes.length ? await db.select().from(resources).where(and(inArray(resources.facilityCode, codes), ne(resources.status, 'retired'))).orderBy(asc(resources.facilityCode), asc(resources.code)) : [];
  const ids = res.map((r) => r.id);
  const from = parisInstant(monday, '00:00');
  const to = parisInstant(addDaysIso(monday, 7 * ENVELOPE_WEEKS), '00:00');
  const [cal, rules, unav, needs, insp] = await Promise.all([
    calendarsOf(db, codes),
    rulesOf(db, codes),
    ids.length ? db.select().from(unavailabilities).where(and(inArray(unavailabilities.resourceId, ids), lt(unavailabilities.startsAt, to), gte(unavailabilities.endsAt, from))) : [],
    ids.length
      ? db.select({ n: testNeeds, entityCode: projects.entityCode, confidential: projects.confidential }).from(testNeeds).innerJoin(projects, eq(projects.code, testNeeds.projectCode))
        .where(and(inArray(testNeeds.resourceId, ids), eq(testNeeds.status, 'open'), gte(testNeeds.deadlineOn, addDaysIso(today, -365))))
      : [],
    ids.length ? db.select().from(inspections).where(and(inArray(inspections.resourceId, ids), eq(inspections.active, true))) : [],
  ]);
  // Bookings of the horizon, and the earlier ones of the open needs (they cover part of them).
  const needIds = needs.map((x) => x.n.id);
  const overlapping = and(lt(bookings.startsAt, to), gte(bookings.endsAt, from));
  const bk = ids.length
    ? await db.select({ resourceId: bookings.resourceId, start: bookings.startsAt, end: bookings.endsAt, status: bookings.status, needId: bookings.needId }).from(bookings)
      .where(and(inArray(bookings.resourceId, ids), ne(bookings.status, 'cancelled'), needIds.length ? or(overlapping, inArray(bookings.needId, needIds)) : overlapping))
    : [];
  const validated = rules.filter((r) => r.status === 'validated').map((r) => ({ code: r.code, maxActive: r.maxActive, resourceIds: r.resourceIds.filter((id) => ids.includes(id)) }));
  const input: LoadInput = {
    weeks, today,
    resources: res.map((r) => ({ id: r.id, code: r.code, facilityCode: r.facilityCode, capacity: r.capacity })),
    calendars: cal, rules: validated,
    unavailabilities: unav.map((u) => ({ resourceId: u.resourceId, start: ms(u.startsAt), end: ms(u.endsAt) })),
    bookings: bk.map((b) => ({ ...b, start: ms(b.start), end: ms(b.end) })),
    needs: needs.map((x) => ({ id: x.n.id, ref: x.n.ref, projectCode: x.n.projectCode, resourceId: x.n.resourceId, level: x.n.level, halfDays: x.n.halfDays, earliestOn: x.n.earliestOn, deadlineOn: x.n.deadlineOn })),
  };
  const forecast = loadForecast(input);
  const signals = loadSignals(forecast, { resources: input.resources, rules: validated }, today);
  const pv = projectVisibility(viewer.role, viewer.assignments);
  const spreadOf = new Map(forecast.needs.map((s) => [s.id, s]));
  const codeOf = new Map(res.map((r) => [r.id, r.code]));
  // R-10: a slot ending after an inspection's due date is refused until the new inspection is recorded — the needs whose window
  // goes beyond it cannot be booked as things stand.
  const dueByResource = insp.map((i) => ({ resourceId: i.resourceId, label: i.label, dueOn: inspectionDueOn(i.lastOn, i.periodMonths) }));
  const inspectionAlerts = needs.flatMap((x) => {
    const left = spreadOf.get(x.n.id)?.remainingHours ?? 0;
    return left > 0 ? dueByResource.filter((d) => d.resourceId === x.n.resourceId && d.dueOn < x.n.deadlineOn).map((d) => ({ needRef: x.n.ref, resourceCode: codeOf.get(d.resourceId) ?? '', label: d.label, dueOn: d.dueOn })) : [];
  });
  return {
    facilities, weeks, forecast, signals, inspectionAlerts,
    resources: res.map((r) => ({ id: r.id, code: r.code, name: r.name, facilityCode: r.facilityCode })),
    rules: validated.filter((r) => forecast.byRule.has(r.code)).map((r) => ({ ...r, facilityCodes: [...new Set(res.filter((x) => r.resourceIds.includes(x.id)).map((x) => x.facilityCode))] })),
    needs: needs.map((x) => {
      const open = canSeeProject(pv, { code: x.n.projectCode, entityCode: x.entityCode, confidential: x.confidential });
      return {
        id: x.n.id, ref: x.n.ref, level: x.n.level, resourceId: x.n.resourceId, resourceCode: codeOf.get(x.n.resourceId) ?? '', earliestOn: x.n.earliestOn, deadlineOn: x.n.deadlineOn,
        halfDays: x.n.halfDays, entityCode: x.entityCode, confidential: x.confidential, projectCode: open ? x.n.projectCode : null, title: open ? x.n.title : null,
        spread: spreadOf.get(x.n.id) ?? null,
      };
    }),
  };
}
