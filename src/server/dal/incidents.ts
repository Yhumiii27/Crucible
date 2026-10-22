import 'server-only';
// Reads of delivery 5 (docs/spec/05 "Aléas et scénarios", "Pilotage"): incidents and scenarios with their moves and the
// consequences per project, the bell, and the steering complements — urgencies counted, delays due to the resources, value of
// the unused capacity, trend of the weekly snapshots. What a booking or a project is for is shown only to those who see the
// project (U-3).
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne } from 'drizzle-orm';
import { mondayOf } from '@/domain/calendar';
import type { Impact, Move } from '@/domain/recovery';
import { canSeeProject, peopleFacilities, projectVisibility } from '@/domain/rights';
import { workdaysBetween } from '@/domain/priority';
import { addDaysIso, parisInstant, parisParts } from '@/lib/dates';
import { getDb } from '@/server/db/client';
import { bookings, incidents, notifications, people, projects, resources, scenarios, testNeeds, weeklySnapshots } from '@/server/db/schema';
import type { Viewer } from '@/server/viewer';
import { visibleFacilities, visibleProjects } from './visibility';

/** Incidents, scenarios (latest first), and what the forms may refer to. */
export async function incidentsScreen(viewer: Viewer) {
  const db = await getDb();
  const facs = await visibleFacilities(viewer);
  const codes = facs.map((f) => f.code);
  const [inc, sc, res, ppl, projs] = await Promise.all([
    db.select().from(incidents).orderBy(desc(incidents.declaredAt)).limit(50),
    db.select().from(scenarios).orderBy(desc(scenarios.createdAt)).limit(50),
    db.select().from(resources),
    db.select().from(people).where(eq(people.active, true)).orderBy(asc(people.name)),
    db.select().from(projects),
  ]);
  const pv = projectVisibility(viewer.role, viewer.assignments);
  const projectOf = new Map(projs.map((p) => [p.code, p]));
  const seen = (code: string) => {
    const p = projectOf.get(code);
    return !!p && canSeeProject(pv, { code: p.code, entityCode: p.entityCode, confidential: p.confidential });
  };
  const visibleRes = res.filter((r) => codes.includes(r.facilityCode) && r.status !== 'retired');
  // Scenarios the viewer may see: those touching a facility they see (a what-if: its author's and the planners').
  const resFacility = new Map(res.map((r) => [r.id, r.facilityCode]));
  const visibleScenario = (s: (typeof sc)[number]) => (s.moves as unknown as Move[]).every((m) => codes.includes(resFacility.get(m.from.resourceId) ?? ''));
  const mine = peopleFacilities(viewer.role, viewer.assignments);
  const openNeeds = viewer.role === 'rd_director' || viewer.role === 'coordinator'
    ? (await db.select({ id: testNeeds.id, ref: testNeeds.ref, projectCode: testNeeds.projectCode, title: testNeeds.title }).from(testNeeds).where(eq(testNeeds.status, 'open')).orderBy(asc(testNeeds.ref))).filter((n) => seen(n.projectCode))
    : [];
  return {
    incidents: inc.filter((i) => !i.resourceId || codes.includes(resFacility.get(i.resourceId) ?? '') || i.declaredByUserId === viewer.userId),
    scenarios: sc.filter(visibleScenario).map((s) => ({ ...s, moves: s.moves as unknown as Move[], impacts: s.impacts as unknown as Impact[] })),
    resourceCode: new Map(res.map((r) => [r.id, r.code])),
    personName: new Map(ppl.map((p) => [p.id, p.name])),
    seenProject: new Set(projs.filter((p) => seen(p.code)).map((p) => p.code)),
    resources: visibleRes.map((r) => ({ id: r.id, code: r.code, name: r.name })),
    people: ppl.filter((p) => p.userId === viewer.userId || p.facilityCodes.some((f) => mine.includes(f))).map((p) => ({ id: p.id, name: p.name })),
    openNeeds,
  };
}

/** The bell: the viewer's notifications, latest first, and how many are unread. */
export async function myNotifications(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(100);
  return { rows, unread: rows.filter((r) => !r.readAt).length };
}

export async function unreadCount(userId: string): Promise<number> {
  const db = await getDb();
  return (await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))).length;
}

/**
 * Steering complements over a period: urgencies declared, needs whose tests end after their deadline (working days late,
 * spec 02 §6 "retards imputables"), the weekly snapshots of the last weeks for the trend, the acquisition cost of the facilities.
 */
export async function steeringFacts(viewer: Viewer, fromIso: string, toIso: string, today: string) {
  const db = await getDb();
  const facs = await visibleFacilities(viewer);
  const codes = facs.map((f) => f.code);
  const res = codes.length ? await db.select().from(resources).where(inArray(resources.facilityCode, codes)) : [];
  const ids = res.map((r) => r.id);
  const from = parisInstant(fromIso, '00:00');
  const to = parisInstant(toIso, '00:00');
  const firstWeek = addDaysIso(mondayOf(today), -7 * 8);
  const [urg, needs, snaps] = await Promise.all([
    db.select({ id: incidents.id }).from(incidents).where(and(eq(incidents.kind, 'urgency'), gte(incidents.declaredAt, from), lt(incidents.declaredAt, to))),
    ids.length
      ? db.select({ n: testNeeds, end: bookings.endsAt, facilityCode: resources.facilityCode }).from(testNeeds).innerJoin(bookings, eq(bookings.needId, testNeeds.id))
        .innerJoin(resources, eq(resources.id, bookings.resourceId))
        .where(and(inArray(bookings.resourceId, ids), ne(bookings.status, 'cancelled'), ne(bookings.status, 'no_show')))
      : [],
    ids.length ? db.select().from(weeklySnapshots).where(and(inArray(weeklySnapshots.resourceId, ids), gte(weeklySnapshots.monday, firstWeek))).orderBy(asc(weeklySnapshots.monday)) : [],
  ]);
  const visible = new Set((await visibleProjects(viewer)).map((p) => p.code));
  const lastEnd = new Map<string, { n: (typeof needs)[number]['n']; end: Date }>();
  for (const x of needs) {
    const cur = lastEnd.get(x.n.id);
    if (!cur || x.end > cur.end) lastEnd.set(x.n.id, { n: x.n, end: x.end });
  }
  const late = [...lastEnd.values()].map(({ n, end }) => {
    const lastDay = parisParts(new Date(end.getTime() - 1)).iso;
    return { ref: n.ref, projectCode: visible.has(n.projectCode) ? n.projectCode : null, deadlineOn: n.deadlineOn, lastDay, lateDays: lastDay > n.deadlineOn ? workdaysBetween(addDaysIso(n.deadlineOn, 1), lastDay) : 0 };
  }).filter((x) => x.lateDays > 0).sort((a, b) => b.lateDays - a.lateDays);
  const facilityOf = new Map(res.map((r) => [r.id, r.facilityCode]));
  return { urgencies: urg.length, late, snapshots: snaps.map((s) => ({ ...s, facilityCode: facilityOf.get(s.resourceId)! })), facilities: facs, acquisition: new Map(facs.map((f) => [f.code, f.acquisitionKeur])) };
}
