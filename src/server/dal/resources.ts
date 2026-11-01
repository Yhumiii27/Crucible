import 'server-only';
// Reads of delivery 2 (docs/spec/02 §1–3, 05): facility sheet, planning of the resources, my schedule, rules, utilisation.
// Every read starts from the facilities the viewer sees (src/server/dal/visibility.ts) and masks what a booking is for when the
// viewer may not see its project (U-3): "Booked · <entity>", or "Booked (confidential)".
import { and, asc, eq, gte, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { DEFAULT_HOURS, inspectionDueOn, openWindows, type Closure, type WeeklyHours } from '@/domain/calendar';
import { resourceUsage, type ResourceUsage } from '@/domain/utilisation';
import { canRequestBooking, canSeeBookingDetail, operatedFacilities } from '@/domain/rights';
import type { BookingStatus } from '@/domain/resources';
import { addDaysIso, parisInstant } from '@/lib/dates';
import { getDb } from '@/server/db/client';
import {
  bookings, closures, entities, entityAgreements, exclusionRuleResources, exclusionRules, facilityHours, inspections, projects, resources, unavailabilities,
} from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import type { Viewer } from '@/server/viewer';
import { facilityForViewer, visibleFacilities, type FacilityRow } from './visibility';

type Q = DB | Tx;
const ms = (d: Date) => d.getTime();

/** Opening hours and closures of facilities (closures without a facility apply to all). */
export async function calendarsOf(q: Q, facilityCodes: readonly string[]): Promise<Map<string, { hours: WeeklyHours[]; closures: Closure[] }>> {
  const out = new Map(facilityCodes.map((c) => [c, { hours: [] as WeeklyHours[], closures: [] as Closure[] }]));
  if (!facilityCodes.length) return out;
  const [h, c] = await Promise.all([
    q.select().from(facilityHours).where(inArray(facilityHours.facilityCode, [...facilityCodes])),
    q.select().from(closures).where(or(isNull(closures.facilityCode), inArray(closures.facilityCode, [...facilityCodes]))),
  ]);
  for (const x of h) out.get(x.facilityCode)?.hours.push({ weekday: x.weekday, opensAt: x.opensAt, closesAt: x.closesAt });
  for (const x of c) for (const [code, cal] of out) if (!x.facilityCode || x.facilityCode === code) cal.closures.push({ fromOn: x.fromOn, toOn: x.toOn, label: x.label });
  return out;
}

export interface RuleRow {
  id: string;
  code: string;
  label: string;
  maxActive: number;
  reason: string;
  motive: string;
  codexRef: string | null;
  status: 'proposed' | 'validated' | 'retired';
  proposedByName: string;
  validatedByName: string | null;
  validatedAt: Date | null;
  retiredReason: string | null;
  resourceIds: string[];
  resourceCodes: string[];
  facilityCodes: string[];
}

/** Exclusion rules with their resources; `facilityCodes` limits to the rules touching those facilities. */
export async function rulesOf(q: Q, facilityCodes?: readonly string[]): Promise<RuleRow[]> {
  const [rs, links] = await Promise.all([
    q.select().from(exclusionRules).orderBy(asc(exclusionRules.code)),
    q.select({ ruleId: exclusionRuleResources.ruleId, resourceId: resources.id, code: resources.code, facilityCode: resources.facilityCode })
      .from(exclusionRuleResources).innerJoin(resources, eq(resources.id, exclusionRuleResources.resourceId)),
  ]);
  return rs
    .map((r) => {
      const mine = links.filter((l) => l.ruleId === r.id).sort((a, b) => a.code.localeCompare(b.code));
      return {
        id: r.id, code: r.code, label: r.label, maxActive: r.maxActive, reason: r.reason, motive: r.motive, codexRef: r.codexRef, status: r.status,
        proposedByName: r.proposedByName, validatedByName: r.validatedByName, validatedAt: r.validatedAt, retiredReason: r.retiredReason,
        resourceIds: mine.map((l) => l.resourceId), resourceCodes: mine.map((l) => l.code), facilityCodes: [...new Set(mine.map((l) => l.facilityCode))].sort(),
      };
    })
    .filter((r) => !facilityCodes || r.facilityCodes.some((f) => facilityCodes.includes(f)));
}

export async function facilitySheet(viewer: Viewer, code: string, today: string) {
  const facility = await facilityForViewer(viewer, code);
  if (!facility) return null;
  const db = await getDb();
  const res = await db.select().from(resources).where(eq(resources.facilityCode, code)).orderBy(asc(resources.code));
  const ids = res.map((r) => r.id);
  const since = parisInstant(addDaysIso(today, -30), '00:00');
  const [cal, unav, insp, rules, agreements] = await Promise.all([
    calendarsOf(db, [code]),
    ids.length ? db.select().from(unavailabilities).where(and(inArray(unavailabilities.resourceId, ids), gte(unavailabilities.endsAt, since))).orderBy(asc(unavailabilities.startsAt)) : [],
    ids.length ? db.select().from(inspections).where(and(inArray(inspections.resourceId, ids), eq(inspections.active, true))).orderBy(asc(inspections.label)) : [],
    rulesOf(db, [code]),
    db.select({ entityCode: entityAgreements.entityCode, entityName: entities.name, quotaDaysPerMonth: entityAgreements.quotaDaysPerMonth, noticeWorkdays: entityAgreements.noticeWorkdays, note: entityAgreements.note })
      .from(entityAgreements).innerJoin(entities, eq(entities.code, entityAgreements.entityCode)).where(eq(entityAgreements.facilityCode, code)),
  ]);
  const codeOf = new Map(res.map((r) => [r.id, r.code]));
  return {
    facility,
    resources: res,
    hours: cal.get(code)!.hours.sort((a, b) => a.weekday - b.weekday),
    closures: cal.get(code)!.closures.filter((c) => c.toOn >= today).sort((a, b) => a.fromOn.localeCompare(b.fromOn)),
    unavailabilities: unav.map((u) => ({ ...u, resourceCode: codeOf.get(u.resourceId) ?? '' })),
    inspections: insp.map((i) => ({ ...i, resourceCode: codeOf.get(i.resourceId) ?? '', dueOn: inspectionDueOn(i.lastOn, i.periodMonths) })),
    rules,
    agreements,
  };
}

export interface PlanBooking {
  id: string;
  ref: string;
  resourceId: string;
  resourceCode: string;
  facilityCode: string;
  start: number;
  end: number;
  status: BookingStatus;
  entityCode: string;
  /** Null when the viewer may not see what the booking is for (U-3). */
  projectCode: string | null;
  projectName: string | null;
  title: string | null;
  confidential: boolean;
  requestedByUserId: string | null;
  requestedByName: string;
  operators: string | null;
  actualStart: number | null;
  actualEnd: number | null;
}

/** Bookings of resources between two instants, masked for the viewer. */
async function bookingsFor(viewer: Viewer, q: Q, resourceIds: readonly string[], from: Date, to: Date, opts: { withCancelled?: boolean } = {}): Promise<PlanBooking[]> {
  if (!resourceIds.length) return [];
  const rows = await q
    .select({
      id: bookings.id, ref: bookings.ref, resourceId: bookings.resourceId, resourceCode: resources.code, facilityCode: resources.facilityCode, startsAt: bookings.startsAt,
      endsAt: bookings.endsAt, status: bookings.status, entityCode: bookings.entityCode, projectCode: bookings.projectCode, projectName: projects.name,
      confidential: projects.confidential, title: bookings.title, requestedByUserId: bookings.requestedByUserId, requestedByName: bookings.requestedByName,
      operators: bookings.operators, actualStartAt: bookings.actualStartAt, actualEndAt: bookings.actualEndAt,
    })
    .from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .innerJoin(projects, eq(projects.code, bookings.projectCode))
    .where(and(inArray(bookings.resourceId, [...resourceIds]), lt(bookings.startsAt, to), gte(bookings.endsAt, from), opts.withCancelled ? undefined : ne(bookings.status, 'cancelled')))
    .orderBy(asc(bookings.startsAt));
  return rows.map((b) => {
    const open = canSeeBookingDetail(viewer.role, viewer.assignments, b.facilityCode, { code: b.projectCode, entityCode: b.entityCode, confidential: b.confidential });
    return {
      id: b.id, ref: b.ref, resourceId: b.resourceId, resourceCode: b.resourceCode, facilityCode: b.facilityCode, start: ms(b.startsAt), end: ms(b.endsAt), status: b.status,
      entityCode: b.entityCode, projectCode: open ? b.projectCode : null, projectName: open ? b.projectName : null, title: open ? b.title : null,
      confidential: b.confidential, requestedByUserId: b.requestedByUserId, requestedByName: open ? b.requestedByName : '',
      operators: open ? b.operators : null, actualStart: b.actualStartAt ? ms(b.actualStartAt) : null, actualEnd: b.actualEndAt ? ms(b.actualEndAt) : null,
    };
  });
}

export interface PlanResource {
  id: string;
  code: string;
  name: string;
  facilityCode: string;
  granularity: 'half_day' | 'hour';
  status: string;
}

/** The week of the resource planning: visible facilities, their resources, calendars, unavailabilities, bookings and rules. */
export async function planningWeek(viewer: Viewer, monday: string) {
  const db = await getDb();
  const facilities = await visibleFacilities(viewer);
  const codes = facilities.map((f) => f.code);
  const res: PlanResource[] = codes.length
    ? (await db.select().from(resources).where(and(inArray(resources.facilityCode, codes), ne(resources.status, 'retired'))).orderBy(asc(resources.facilityCode), asc(resources.code)))
      .map((r) => ({ id: r.id, code: r.code, name: r.name, facilityCode: r.facilityCode, granularity: r.granularity, status: r.status }))
    : [];
  const from = parisInstant(monday, '00:00');
  const to = parisInstant(addDaysIso(monday, 7), '00:00');
  const ids = res.map((r) => r.id);
  const [cal, unav, plan, rules] = await Promise.all([
    calendarsOf(db, codes),
    ids.length ? db.select().from(unavailabilities).where(and(inArray(unavailabilities.resourceId, ids), lt(unavailabilities.startsAt, to), gte(unavailabilities.endsAt, from))) : [],
    bookingsFor(viewer, db, ids, from, to),
    rulesOf(db, codes),
  ]);
  return {
    facilities, resources: res, calendars: cal, plan,
    unavailabilities: unav.map((u) => ({ resourceId: u.resourceId, start: ms(u.startsAt), end: ms(u.endsAt), label: u.label })),
    rules: rules.filter((r) => r.status === 'validated'),
  };
}

/** Projects the viewer may book for, and the facilities and resources they may book (the request form). */
export function bookingChoices(viewer: Viewer, visible: readonly { code: string; entityCode: string; confidential: boolean; name: string }[], facilities: readonly FacilityRow[]) {
  const pairs = facilities.flatMap((f) => visible.filter((p) => canRequestBooking(viewer.role, viewer.assignments, f, p)).map((p) => ({ facilityCode: f.code, projectCode: p.code })));
  return {
    projects: visible.filter((p) => pairs.some((x) => x.projectCode === p.code)).map((p) => ({ code: p.code, name: p.name })),
    facilityCodes: [...new Set(pairs.map((x) => x.facilityCode))],
  };
}

/** My schedule: the bookings of the facilities I run, from yesterday to a week ahead (start, end, release a no-show). */
export async function mySchedule(viewer: Viewer, today: string) {
  const db = await getDb();
  const codes = operatedFacilities(viewer.role, viewer.assignments);
  const res = codes.length ? await db.select({ id: resources.id }).from(resources).where(inArray(resources.facilityCode, codes)) : [];
  const from = parisInstant(addDaysIso(today, -1), '00:00');
  const to = parisInstant(addDaysIso(today, 8), '00:00');
  const rows = await bookingsFor(viewer, db, res.map((r) => r.id), from, to);
  return rows.filter((b) => b.status !== 'requested' && b.status !== 'no_show');
}

/** Everything the utilisation dashboard needs over a period, for the visible facilities. */
export async function usageFacts(viewer: Viewer, fromIso: string, toIso: string, month: { fromIso: string; toIso: string }) {
  const db = await getDb();
  const facilities = await visibleFacilities(viewer);
  const codes = facilities.map((f) => f.code);
  const res = codes.length ? await db.select().from(resources).where(and(inArray(resources.facilityCode, codes), ne(resources.status, 'retired'))).orderBy(asc(resources.facilityCode), asc(resources.code)) : [];
  const ids = res.map((r) => r.id);
  const from = parisInstant(fromIso, '00:00');
  const to = parisInstant(toIso, '00:00');
  const [cal, unav, rules, rows, agreements] = await Promise.all([
    calendarsOf(db, codes),
    ids.length ? db.select().from(unavailabilities).where(and(inArray(unavailabilities.resourceId, ids), lt(unavailabilities.startsAt, to), gte(unavailabilities.endsAt, from))) : [],
    rulesOf(db, codes),
    ids.length
      ? db.select({
        resourceId: bookings.resourceId, start: bookings.startsAt, end: bookings.endsAt, status: bookings.status, actualStart: bookings.actualStartAt, actualEnd: bookings.actualEndAt,
        setupMinutes: bookings.setupMinutes, teardownMinutes: bookings.teardownMinutes, entityCode: bookings.entityCode, projectCode: bookings.projectCode,
        requestedAt: bookings.requestedAt, facilityCode: resources.facilityCode, source: bookings.source,
      }).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId))
        .where(and(inArray(bookings.resourceId, ids), lt(bookings.startsAt, to), gte(bookings.endsAt, from), ne(bookings.status, 'cancelled')))
      : [],
    codes.length ? db.select().from(entityAgreements).where(inArray(entityAgreements.facilityCode, codes)) : [],
  ]);
  const m0 = parisInstant(month.fromIso, '00:00');
  const m1 = parisInstant(month.toIso, '00:00');
  const monthRows = agreements.length
    ? await db.select({ facilityCode: resources.facilityCode, entityCode: bookings.entityCode, start: bookings.startsAt, end: bookings.endsAt, status: bookings.status })
      .from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId))
      .where(and(inArray(resources.facilityCode, agreements.map((a) => a.facilityCode)), lt(bookings.startsAt, m1), gte(bookings.endsAt, m0), ne(bookings.status, 'cancelled')))
    : [];
  return {
    monthBookings: monthRows.map((b) => ({ ...b, start: Math.max(ms(b.start), ms(m0)), end: Math.min(ms(b.end), ms(m1)) })),
    facilities, resources: res, calendars: cal, rules: rules.filter((r) => r.status === 'validated'),
    unavailabilities: unav.map((u) => ({ resourceId: u.resourceId, start: ms(u.startsAt), end: ms(u.endsAt) })),
    bookings: rows.map((b) => ({ ...b, start: ms(b.start), end: ms(b.end), actualStart: b.actualStart ? ms(b.actualStart) : null, actualEnd: b.actualEnd ? ms(b.actualEnd) : null, requestedAt: ms(b.requestedAt) })),
    agreements,
    period: { start: ms(from), end: ms(to) },
  };
}

/** The usage of every resource of `usageFacts` over its period (the dashboard, the pilot's reference measure). */
export function resourceUsages(f: Awaited<ReturnType<typeof usageFacts>>, fromIso: string, toIso: string): Map<string, ResourceUsage> {
  return new Map(f.resources.map((r) => {
    const cal = f.calendars.get(r.facilityCode)!;
    return [r.id, resourceUsage({
      resourceId: r.id, period: f.period, open: openWindows(cal.hours.length ? cal.hours : DEFAULT_HOURS, cal.closures, fromIso, toIso),
      unavailable: f.unavailabilities.filter((u) => u.resourceId === r.id), bookings: f.bookings, rules: f.rules,
    })];
  }));
}

/** Bookings of the visible resources between two instants, masked for the viewer (the monthly report, CR-077). */
export async function bookingsBetween(viewer: Viewer, resourceIds: readonly string[], from: Date, to: Date): Promise<PlanBooking[]> {
  const db = await getDb();
  return bookingsFor(viewer, db, resourceIds, from, to);
}

/** Rules and agreements screen. */
export async function rulesScreen(viewer: Viewer) {
  const db = await getDb();
  const facilities = await visibleFacilities(viewer);
  const codes = facilities.map((f) => f.code);
  const [rules, res, agreements, ents] = await Promise.all([
    rulesOf(db, codes),
    codes.length ? db.select({ id: resources.id, code: resources.code, name: resources.name, facilityCode: resources.facilityCode }).from(resources).where(and(inArray(resources.facilityCode, codes), ne(resources.status, 'retired'))).orderBy(asc(resources.code)) : [],
    codes.length ? db.select().from(entityAgreements).where(inArray(entityAgreements.facilityCode, codes)).orderBy(asc(entityAgreements.facilityCode)) : [],
    db.select().from(entities).orderBy(asc(entities.code)),
  ]);
  return { facilities, rules, resources: res, agreements, entities: ents };
}

/** Bookings of the visible facilities from today over the next `days` days, masked for the viewer (home, delivery 5b). */
export async function upcomingBookings(viewer: Viewer, today: string, days = 7): Promise<PlanBooking[]> {
  const db = await getDb();
  const codes = (await visibleFacilities(viewer)).map((f) => f.code);
  const res = codes.length ? await db.select({ id: resources.id }).from(resources).where(inArray(resources.facilityCode, codes)) : [];
  const rows = await bookingsFor(viewer, db, res.map((r) => r.id), parisInstant(today, '00:00'), parisInstant(addDaysIso(today, days), '00:00'));
  return rows.filter((b) => b.status !== 'no_show');
}
