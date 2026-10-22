'use server';
// Server Functions of delivery 5 (docs/spec/01 §3, 03 §7, decisions A-8, F-8): incidents declared by any person of the tests
// (a breakdown takes a resource out, an absence a person), the recovery scenario computed at once and submitted to a decider,
// what-if simulations (never applied), urgencies declared by the R&D director or the coordinator, the decision on a scenario
// (the R&D director, or the coordinator of every facility it touches: only then are bookings moved), the bell. Each checks the
// viewer's active role and scope server-side, re-reads inside its transaction (writes serialised by the write lock), writes,
// audits, notifies and revalidates.
import { and, desc, eq, inArray, isNull, like } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { isIsoDate } from '@/domain/clock';
import type { Move } from '@/domain/recovery';
import { canSeeFacility, facilityVisibility, managedFacilities, peopleFacilities } from '@/domain/rights';
import { addDaysIso, parisInstant, parisParts } from '@/lib/dates';
import { businessNow, businessToday } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { bookings, facilities, facilityPartners, incidents, notifications, people, personAbsences, resources, scenarios, testNeeds, unavailabilities } from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { notify, usersWithRole } from '@/server/notify';
import { applyScenario, buildScenario, saveScenario, type BuiltScenario } from '@/server/planning/scenarios';
import { getViewer, type Viewer } from '@/server/session';

export type ActionResult = { ok: true; warnings?: string[] } | { ok: false; error: string };

const REFUSED: ActionResult = { ok: false, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Profiles that declare an incident (spec 01 §3): everyone who works with the tests. */
const DECLARERS = ['rd_director', 'coordinator', 'facility_manager', 'safety', 'project_lead', 'technician', 'partner'];

function revalidate() {
  for (const p of ['/incidents', '/planning', '/my/schedule', '/my/needs', '/notifications', '/']) revalidatePath(p);
}

async function nextIncidentRef(tx: Tx, year: string): Promise<string> {
  const [last] = await tx.select({ ref: incidents.ref }).from(incidents).where(like(incidents.ref, `AL-${year}-%`)).orderBy(desc(incidents.ref)).limit(1);
  return `AL-${year}-${String(last ? Number(last.ref.slice(8)) + 1 : 1).padStart(4, '0')}`;
}

/** A resource of a facility the viewer sees. */
async function visibleResource(tx: Tx, v: Viewer, id: string) {
  if (!isUuid(id)) return null;
  const [r] = await tx.select().from(resources).where(eq(resources.id, id));
  if (!r) return null;
  const [f] = await tx.select().from(facilities).where(eq(facilities.code, r.facilityCode));
  const partners = (await tx.select().from(facilityPartners).where(eq(facilityPartners.facilityCode, r.facilityCode))).map((x) => x.entityCode);
  return canSeeFacility(facilityVisibility(v.role, v.assignments), { code: f.code, operatorEntityCode: f.operatorEntityCode, partnerEntityCodes: partners }) ? r : null;
}

/** Facilities of the resources a scenario moves from or to. */
async function facilitiesOf(tx: Tx, moves: readonly Move[], extra: readonly string[] = []): Promise<string[]> {
  const ids = [...new Set([...moves.flatMap((m) => [m.from.resourceId, m.to?.resourceId]), ...extra].filter((x): x is string => !!x))];
  if (!ids.length) return [];
  return [...new Set((await tx.select({ f: resources.facilityCode }).from(resources).where(inArray(resources.id, ids))).map((x) => x.f))];
}

/** Records a submitted scenario and tells its deciders (coordinators of the facilities touched, the R&D director) and the requesters touched. */
async function submit(tx: Tx, v: Viewer, built: BuiltScenario, incident: { id: string; ref: string }, now: Date, facilityCodes: string[], requesterIds: (string | null)[]) {
  const saved = await saveScenario(tx, built, { incidentId: incident.id, status: 'submitted', by: { name: v.name, userId: v.userId, role: v.role }, now });
  const deciders = [...await usersWithRole(tx, ['coordinator'], facilityCodes), ...await usersWithRole(tx, ['rd_director'])];
  await notify(tx, deciders, { kind: 'scenario', title: `Scenario to decide · ${saved.ref} · ${incident.ref}`, href: '/incidents' }, { except: v.userId, at: now });
  await notify(tx, requesterIds, { kind: 'incident', title: `Incident on your test · ${incident.ref}`, href: '/my/needs' }, { except: v.userId, at: now });
  return saved;
}

export async function declareIncidentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (!DECLARERS.includes(v.role)) return REFUSED;
  const kind = text(fd, 'kind');
  const fromOn = text(fd, 'fromOn');
  const toOn = text(fd, 'toOn') || fromOn;
  const label = text(fd, 'label');
  if (kind !== 'breakdown' && kind !== 'absence') return { ok: false, error: 'Choose a breakdown or an absence' };
  if (!isIsoDate(fromOn) || !isIsoDate(toOn) || toOn < fromOn) return { ok: false, error: 'Enter the first and last days' };
  if (label.length < 3 || label.length > 200) return { ok: false, error: 'Describe the incident' };
  const [today, now] = await Promise.all([businessToday(), businessNow()]);
  if (toOn < today) return { ok: false, error: 'The incident is over: nothing to replan' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const start = parisInstant(fromOn, '00:00');
    const end = parisInstant(addDaysIso(toOn, 1), '00:00');
    const ref = await nextIncidentRef(tx, parisParts(now).iso.slice(0, 4));
    let incident: { id: string; ref: string };
    let built: BuiltScenario;
    let facilityCodes: string[];
    if (kind === 'breakdown') {
      const res = await visibleResource(tx, v, text(fd, 'resourceId'));
      if (!res) return { ok: false, error: 'Choose one of the resources' };
      const [u] = await tx.insert(unavailabilities).values({ resourceId: res.id, kind: 'breakdown', label, startsAt: start, endsAt: end, source: 'incident', createdByName: v.name }).returning({ id: unavailabilities.id });
      const [inc] = await tx.insert(incidents).values({ ref, kind, resourceId: res.id, label, startsAt: start, endsAt: end, unavailabilityId: u.id, declaredByUserId: v.userId, declaredByName: v.name, declaredAt: now }).returning({ id: incidents.id });
      incident = { id: inc.id, ref };
      built = await buildScenario(tx, { kind: 'breakdown', resourceId: res.id, start, end, label }, today, now);
      facilityCodes = await facilitiesOf(tx, built.moves, [res.id]);
    } else {
      const personId = text(fd, 'personId');
      if (!isUuid(personId)) return { ok: false, error: 'Choose a person' };
      const [p] = await tx.select().from(people).where(eq(people.id, personId));
      const mine = peopleFacilities(v.role, v.assignments);
      if (!p || !(p.userId === v.userId || p.facilityCodes.some((f) => mine.includes(f)))) return { ok: false, error: 'You may declare your own absence, or one of a person of your facilities' };
      await tx.insert(personAbsences).values({ personId: p.id, fromOn, toOn, source: 'incident', createdByName: v.name });
      const [inc] = await tx.insert(incidents).values({ ref, kind, personId: p.id, label, startsAt: start, endsAt: end, declaredByUserId: v.userId, declaredByName: v.name, declaredAt: now }).returning({ id: incidents.id });
      incident = { id: inc.id, ref };
      built = await buildScenario(tx, { kind: 'absence', personId: p.id, fromOn, toOn }, today, now);
      facilityCodes = [...new Set([...p.facilityCodes, ...await facilitiesOf(tx, built.moves)])];
    }
    const touched = built.moves.length ? await tx.select({ u: bookings.requestedByUserId }).from(bookings).where(inArray(bookings.id, built.moves.map((m) => m.bookingId))) : [];
    // Nothing touched: the incident is recorded, there is no scenario to decide.
    const saved = built.moves.length ? await submit(tx, v, built, incident, now, facilityCodes, touched.map((x) => x.u)) : null;
    await writeAudit(tx, {
      actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef: `Incident ${ref}`, area: 'Incidents', change: `${kind} declared: ${fromOn} → ${toOn}`,
      entityType: 'incident', entityId: incident.id, after: { label, scenario: saved?.ref ?? null, moves: built.moves.length },
    });
    return { ok: true, warnings: [`Incident ${ref}`, saved ? `Scenario ${saved.ref}` : 'No booking touched'] };
  });
  if (r.ok) revalidate();
  return r;
}

/** A what-if simulation (spec 03 §7): a resource out over some days — never applied, nothing is notified. */
export async function simulateAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (!['rd_director', 'coordinator', 'project_lead'].includes(v.role)) return REFUSED;
  const fromOn = text(fd, 'fromOn');
  const toOn = text(fd, 'toOn') || fromOn;
  if (!isIsoDate(fromOn) || !isIsoDate(toOn) || toOn < fromOn) return { ok: false, error: 'Enter the first and last days' };
  const [today, now] = await Promise.all([businessToday(), businessNow()]);
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const res = await visibleResource(tx, v, text(fd, 'resourceId'));
    if (!res) return { ok: false, error: 'Choose one of the resources' };
    const start = parisInstant(fromOn, '00:00');
    const end = parisInstant(addDaysIso(toOn, 1), '00:00');
    const built = await buildScenario(tx, { kind: 'breakdown', resourceId: res.id, start, end, label: 'What if', hypothetical: true }, today, now);
    const saved = await saveScenario(tx, built, { incidentId: null, hypothesis: { resource: res.code, fromOn, toOn }, status: 'simulation', by: { name: v.name, userId: v.userId, role: v.role }, now });
    await writeAudit(tx, { actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef: `Scenario ${saved.ref}`, area: 'Incidents', change: `what-if simulation: ${res.code} out ${fromOn} → ${toOn}` });
    return { ok: true, warnings: [`Scenario ${saved.ref}`] };
  });
  if (r.ok) revalidatePath('/incidents');
  return r;
}

/** An urgent test (A-8): the R&D director, or the coordinator by delegation; the reason is required; the impact is a scenario. */
export async function declareUrgencyAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (v.role !== 'rd_director' && v.role !== 'coordinator') return { ok: false, error: 'Only the R&D director or the coordinator declares an urgency' };
  const needId = text(fd, 'needId');
  const reason = text(fd, 'reason');
  if (!isUuid(needId)) return { ok: false, error: 'Choose an open need' };
  if (reason.length < 5) return { ok: false, error: 'Give the reason of the urgency' };
  const [today, now] = await Promise.all([businessToday(), businessNow()]);
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [n] = await tx.select().from(testNeeds).where(and(eq(testNeeds.id, needId), eq(testNeeds.status, 'open')));
    if (!n) return { ok: false, error: 'Choose an open need' };
    const built = await buildScenario(tx, { kind: 'urgency', needId }, today, now);
    if (!built.urgentSlot) return { ok: false, error: 'The urgent test cannot be placed: no qualified person, equipment or resource in the horizon' };
    const ref = await nextIncidentRef(tx, parisParts(now).iso.slice(0, 4));
    const [inc] = await tx.insert(incidents).values({
      ref, kind: 'urgency', needId, resourceId: built.urgentSlot.resourceId, label: reason, startsAt: new Date(built.urgentSlot.start), endsAt: new Date(built.urgentSlot.end),
      declaredByUserId: v.userId, declaredByName: v.name, declaredAt: now,
    }).returning({ id: incidents.id });
    const facilityCodes = await facilitiesOf(tx, built.moves, [built.urgentSlot.resourceId]);
    const touched = built.moves.length ? await tx.select({ u: bookings.requestedByUserId }).from(bookings).where(inArray(bookings.id, built.moves.map((m) => m.bookingId))) : [];
    const saved = await submit(tx, v, built, { id: inc.id, ref }, now, facilityCodes, touched.map((x) => x.u));
    await writeAudit(tx, {
      actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef: `Incident ${ref}`, area: 'Incidents', change: `urgency declared: ${n.ref}`,
      entityType: 'incident', entityId: inc.id, projectCode: n.projectCode, reason, after: { scenario: saved.ref, displaced: built.moves.length },
    });
    return { ok: true, warnings: [`Incident ${ref}`, `Scenario ${saved.ref}`] };
  });
  if (r.ok) revalidate();
  return r;
}

/**
 * Accepts or rejects a submitted scenario (A-8: the decider validates the moves): the R&D director, or a coordinator of every
 * facility the scenario touches. Accepting applies it: each move checked again, bookings moved, requesters notified.
 */
export async function decideScenarioAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const id = text(fd, 'scenarioId');
  const decision = text(fd, 'decision');
  const reason = text(fd, 'reason');
  if (!isUuid(id)) return REFUSED;
  if (decision !== 'accept' && decision !== 'reject') return { ok: false, error: 'Accept or reject the scenario' };
  if (reason.length < 3) return { ok: false, error: 'Give the reason' };
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [sc] = await tx.select().from(scenarios).where(eq(scenarios.id, id));
    if (!sc) return REFUSED;
    if (sc.status !== 'submitted') return { ok: false, error: 'This scenario is not awaiting a decision' };
    const slot = (sc.hypothesis as { urgentSlot?: { resourceId: string } } | null)?.urgentSlot;
    const touched = await facilitiesOf(tx, sc.moves as unknown as Move[], slot ? [slot.resourceId] : []);
    const mine = managedFacilities(v.role, v.assignments);
    if (v.role !== 'rd_director' && !(v.role === 'coordinator' && touched.every((f) => mine.includes(f)))) return { ok: false, error: 'The R&D director or the coordinator of the facilities touched decides' };
    let warnings: string[] = [];
    if (decision === 'accept') {
      const applied = await applyScenario(tx, id, { name: v.name, userId: v.userId, role: v.role }, now);
      warnings = [`${applied.moved} bookings moved`, ...(applied.urgentRef ? [`Booking confirmed · ${applied.urgentRef}`] : []), ...applied.skipped];
    }
    await tx.update(scenarios).set({ status: decision === 'accept' ? 'accepted' : 'rejected', decidedByName: v.name, decidedAt: now, decisionReason: reason }).where(eq(scenarios.id, id));
    await writeAudit(tx, { actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef: `Scenario ${sc.ref}`, area: 'Incidents', change: `status: submitted → ${decision === 'accept' ? 'accepted' : 'rejected'}`, reason, after: { warnings } });
    return { ok: true, warnings };
  });
  if (r.ok) revalidate();
  return r;
}

/** Closes an incident (the resource is back): a breakdown's unavailability ends now if it was to end later. */
export async function closeIncidentAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [inc] = await tx.select().from(incidents).where(eq(incidents.id, id));
    if (!inc) return REFUSED;
    const [res] = inc.resourceId ? await tx.select().from(resources).where(eq(resources.id, inc.resourceId)) : [];
    const manages = res ? managedFacilities(v.role, v.assignments).includes(res.facilityCode) : false;
    if (inc.declaredByUserId !== v.userId && !manages && v.role !== 'rd_director') return REFUSED;
    if (inc.status === 'closed') return { ok: true };
    await tx.update(incidents).set({ status: 'closed', updatedAt: new Date() }).where(eq(incidents.id, id));
    if (inc.unavailabilityId && inc.endsAt > now) await tx.update(unavailabilities).set({ endsAt: now > inc.startsAt ? now : inc.startsAt, updatedAt: new Date() }).where(eq(unavailabilities.id, inc.unavailabilityId));
    await writeAudit(tx, { actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef: `Incident ${inc.ref}`, area: 'Incidents', change: 'status: open → closed', entityType: 'incident', entityId: id });
    return { ok: true };
  });
  if (r.ok) revalidate();
  return r;
}

// ── Bell (F-8) ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function markNotificationsReadAction(): Promise<ActionResult> {
  const v = await getViewer();
  const db = await getDb();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, v.userId), isNull(notifications.readAt)));
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
  return { ok: true };
}
