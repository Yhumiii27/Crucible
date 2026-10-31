'use server';
// Server Functions of delivery 2 (docs/spec/01 §3, 02, 03 §3): resources and calendars (facility managers and coordinators of
// the facility), exclusion rules (proposed by them, validated or retired by the safety officer, R-3), sharing agreements (R&D
// director, A-3), bookings (request, confirm, cancel, start, finish, release a no-show, import the history). Each one checks
// the viewer's active role and scope server-side, re-reads what it touches inside its transaction (writes are serialised by
// the write lock), checks the hard constraints with the pure rules of src/domain/booking.ts, writes, audits and revalidates.
import { and, desc, eq, gte, inArray, like, lt, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { checkBooking, canMarkNoShow, canTransition, ISSUE_LABEL, slotInterval, type Issue } from '@/domain/booking';
import { DEFAULT_HOURS, inspectionDueOn, isHhmm } from '@/domain/calendar';
import { isIsoDate } from '@/domain/clock';
import { parseHistory } from '@/domain/history-import';
import { DEFAULT_NOTICE_WORKDAYS } from '@/domain/needs';
import {
  checkAgreement, checkExclusionRule, checkInspection, checkResource, checkSlotInput, checkTitle, checkUnavailability, RESOURCE_STATUSES, type ResourceStatus,
} from '@/domain/resources';
import { canRequestBooking, canSeeFacility, facilityVisibility, managedFacilities, operatedFacilities } from '@/domain/rights';
import { addDaysIso, parisInstant, parisParts } from '@/lib/dates';
import { businessNow, businessToday } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import {
  bookings, closures, entityAgreements, exclusionRuleResources, exclusionRules, facilities, facilityHours, facilityPartners, inspections, projects, resources, testNeeds, unavailabilities,
} from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { calendarsOf, rulesOf } from '@/server/dal/resources';
import { notify } from '@/server/notify';
import { getViewer, type Viewer } from '@/server/session';

export type ActionResult = { ok: true; warnings?: string[] } | { ok: false; error: string };

const fieldsOf = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
const audit = (v: Viewer, area: string, objectRef: string, change: string, extra: { entityType?: string; entityId?: string; projectCode?: string; before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string } = {}) => ({
  actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef, change, area, ...extra,
});
/** "Exclusion rule · PDE-ONE-ZONE · PDE-ATM": translated segment by segment, references shown as typed. */
const issueText = (i: Issue) => (i.ref ? `${ISSUE_LABEL[i.code]} · ${i.ref}` : ISSUE_LABEL[i.code]);
const REFUSED: ActionResult = { ok: false, error: 'This action is not in your workspace' };

function revalidate(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

// ── Resources and calendars ──────────────────────────────────────────────────────────────────────────────────────────────

/** A facility the viewer manages (coordinator, facility manager), else null. */
async function managed(tx: Tx, v: Viewer, facilityCode: string) {
  if (!managedFacilities(v.role, v.assignments).includes(facilityCode)) return null;
  return (await tx.select().from(facilities).where(eq(facilities.code, facilityCode)))[0] ?? null;
}

export async function createResourceAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const mine = managedFacilities(v.role, v.assignments);
  if (!mine.length) return REFUSED;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const taken = new Set((await tx.select({ c: resources.code }).from(resources)).map((x) => x.c));
    const c = checkResource(fieldsOf(fd), { taken, facilities: new Set(mine) });
    if (!c.ok) return c;
    const [row] = await tx.insert(resources).values(c.value).returning({ id: resources.id });
    await writeAudit(tx, audit(v, 'Facilities', `Resource ${c.value.code}`, 'resource created', { entityType: 'resource', entityId: row.id, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate(`/facilities/${fd.get('facilityCode')}`, '/planning');
  return r;
}

export async function setResourceStatusAction(resourceId: string, status: string): Promise<ActionResult> {
  const v = await getViewer();
  if (!(RESOURCE_STATUSES as readonly string[]).includes(status)) return { ok: false, error: 'Unknown status' };
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [res] = await tx.select().from(resources).where(eq(resources.id, resourceId));
    if (!res || !(await managed(tx, v, res.facilityCode))) return REFUSED;
    facilityCode = res.facilityCode;
    if (res.status === status) return { ok: true };
    await tx.update(resources).set({ status: status as ResourceStatus, updatedAt: new Date() }).where(eq(resources.id, resourceId));
    await writeAudit(tx, audit(v, 'Facilities', `Resource ${res.code}`, `status: ${res.status} → ${status}`, { entityType: 'resource', entityId: res.id }));
    return { ok: true };
  });
  if (r.ok) revalidate(`/facilities/${facilityCode}`, '/planning');
  return r;
}

/** Opening hours of a facility (R-9): one line per weekday, empty times = closed. */
export async function setFacilityHoursAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const facilityCode = String(fd.get('facilityCode') ?? '');
  const rows: { weekday: number; opensAt: string; closesAt: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    const o = String(fd.get(`opens${d}`) ?? '').trim();
    const c = String(fd.get(`closes${d}`) ?? '').trim();
    if (!o && !c) continue;
    if (!isHhmm(o) || !isHhmm(c) || c <= o) return { ok: false, error: 'Each open day has an opening time before its closing time (HH:MM)' };
    rows.push({ weekday: d, opensAt: o, closesAt: c });
  }
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    if (!(await managed(tx, v, facilityCode))) return REFUSED;
    const before = await tx.select().from(facilityHours).where(eq(facilityHours.facilityCode, facilityCode));
    await tx.delete(facilityHours).where(eq(facilityHours.facilityCode, facilityCode));
    if (rows.length) await tx.insert(facilityHours).values(rows.map((x) => ({ ...x, facilityCode })));
    await writeAudit(tx, audit(v, 'Facilities', `Facility ${facilityCode}`, 'opening hours updated', { before: { hours: before.map((x) => ({ weekday: x.weekday, opensAt: x.opensAt, closesAt: x.closesAt })) }, after: { hours: rows } }));
    return { ok: true };
  });
  if (r.ok) revalidate(`/facilities/${facilityCode}`, '/planning');
  return r;
}

/**
 * Acquisition cost of a facility, in k€ (delivery 5, P-8): the base of the value of the unused capacity in the steering. Set by the
 * R&D director; empty = unknown (no value shown).
 */
export async function setAcquisitionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (v.role !== 'rd_director') return REFUSED;
  const facilityCode = String(fd.get('facilityCode') ?? '');
  const raw = String(fd.get('acquisitionKeur') ?? '').trim();
  const value = raw === '' ? null : Number(raw);
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 1_000_000)) return { ok: false, error: 'Enter the acquisition cost in k€ (a whole number)' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [f] = await tx.select().from(facilities).where(eq(facilities.code, facilityCode));
    if (!f) return REFUSED;
    await tx.update(facilities).set({ acquisitionKeur: value }).where(eq(facilities.code, facilityCode));
    await writeAudit(tx, audit(v, 'Facilities', `Facility ${facilityCode}`, `acquisition cost: ${f.acquisitionKeur ?? '—'} → ${value ?? '—'} k€`, { before: { acquisitionKeur: f.acquisitionKeur }, after: { acquisitionKeur: value } }));
    return { ok: true };
  });
  if (r.ok) revalidate(`/facilities/${facilityCode}`, '/dashboard');
  return r;
}

export async function addClosureAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const facilityCode = String(fd.get('facilityCode') ?? '');
  const fromOn = String(fd.get('fromOn') ?? '');
  const toOn = String(fd.get('toOn') ?? '') || fromOn;
  const label = String(fd.get('label') ?? '').trim();
  if (!isIsoDate(fromOn) || !isIsoDate(toOn) || toOn < fromOn) return { ok: false, error: 'Enter the first and last days' };
  if (label.length < 2 || label.length > 120) return { ok: false, error: 'Name the closure' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    if (!(await managed(tx, v, facilityCode))) return REFUSED;
    await tx.insert(closures).values({ facilityCode, fromOn, toOn, label });
    await writeAudit(tx, audit(v, 'Facilities', `Facility ${facilityCode}`, `closure added: ${fromOn} → ${toOn}`, { after: { fromOn, toOn, label } }));
    return { ok: true };
  });
  if (r.ok) revalidate(`/facilities/${facilityCode}`, '/planning');
  return r;
}

export async function addUnavailabilityAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const c = checkUnavailability(fieldsOf(fd));
  if (!c.ok) return c;
  const resourceId = String(fd.get('resourceId') ?? '');
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [res] = await tx.select().from(resources).where(eq(resources.id, resourceId));
    if (!res || !(await managed(tx, v, res.facilityCode))) return REFUSED;
    facilityCode = res.facilityCode;
    const startsAt = parisInstant(c.value.fromOn, '00:00');
    const endsAt = parisInstant(addDaysIso(c.value.toOn, 1), '00:00');
    const held = await tx.select({ ref: bookings.ref }).from(bookings)
      .where(and(eq(bookings.resourceId, resourceId), inArray(bookings.status, ['confirmed', 'in_progress']), lt(bookings.startsAt, endsAt), gte(bookings.endsAt, startsAt)));
    const [u] = await tx.insert(unavailabilities).values({ resourceId, kind: c.value.kind, label: c.value.label, startsAt, endsAt, createdByName: v.name }).returning({ id: unavailabilities.id });
    await writeAudit(tx, audit(v, 'Facilities', `Resource ${res.code}`, `unavailable: ${c.value.fromOn} → ${c.value.toOn}`, { entityType: 'unavailability', entityId: u.id, after: { ...c.value } }));
    // Bookings already confirmed on these days stay as they are: replanning them is a person's decision (delivery 5).
    return { ok: true, warnings: held.length ? [`Confirmed bookings on these days · ${held.map((h) => h.ref).join(', ')}`] : undefined };
  });
  if (r.ok) revalidate(`/facilities/${facilityCode}`, '/planning');
  return r;
}

export async function removeUnavailabilityAction(id: string): Promise<ActionResult> {
  const v = await getViewer();
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [u] = await tx.select({ u: unavailabilities, code: resources.code, facilityCode: resources.facilityCode }).from(unavailabilities)
      .innerJoin(resources, eq(resources.id, unavailabilities.resourceId)).where(eq(unavailabilities.id, id));
    if (!u || !(await managed(tx, v, u.facilityCode))) return REFUSED;
    facilityCode = u.facilityCode;
    await tx.delete(unavailabilities).where(eq(unavailabilities.id, id));
    await writeAudit(tx, audit(v, 'Facilities', `Resource ${u.code}`, `unavailability removed: ${u.u.label}`, { entityType: 'unavailability', entityId: id, before: { label: u.u.label, startsAt: u.u.startsAt.toISOString(), endsAt: u.u.endsAt.toISOString() } }));
    return { ok: true };
  });
  if (r.ok) revalidate(`/facilities/${facilityCode}`, '/planning');
  return r;
}

/** Records a periodic inspection, or its latest date (same resource and label: updated in place, audited). */
export async function recordInspectionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const today = await businessToday();
  const c = checkInspection(fieldsOf(fd), today);
  if (!c.ok) return c;
  const resourceId = String(fd.get('resourceId') ?? '');
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [res] = await tx.select().from(resources).where(eq(resources.id, resourceId));
    if (!res || !(await managed(tx, v, res.facilityCode))) return REFUSED;
    facilityCode = res.facilityCode;
    const [before] = await tx.select().from(inspections).where(and(eq(inspections.resourceId, resourceId), eq(inspections.label, c.value.label)));
    if (before?.source === 'vigie') return { ok: false, error: 'This inspection comes from Vigie: record it there' };
    const row = { ...c.value, resourceId, updatedByName: v.name, active: true, updatedAt: new Date() };
    await tx.insert(inspections).values(row).onConflictDoUpdate({ target: [inspections.resourceId, inspections.label], set: row });
    await writeAudit(tx, audit(v, 'Facilities', `Resource ${res.code}`, before ? `inspection: ${c.value.label} · ${before.lastOn} → ${c.value.lastOn}` : `inspection recorded: ${c.value.label} · ${c.value.lastOn}`, {
      entityType: 'inspection', before: before ? { lastOn: before.lastOn, periodMonths: before.periodMonths } : undefined, after: { ...c.value },
    }));
    return { ok: true };
  });
  if (r.ok) revalidate(`/facilities/${facilityCode}`, '/planning');
  return r;
}

// ── Exclusion rules and agreements ───────────────────────────────────────────────────────────────────────────────────────

/** Proposed by a coordinator or a facility manager on their facilities, or by the safety officer; it applies once validated. */
export async function proposeRuleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const scope = v.role === 'safety' ? null : managedFacilities(v.role, v.assignments);
  if (scope && !scope.length) return REFUSED;
  const raw: Record<string, unknown> = { ...fieldsOf(fd), resourceIds: fd.getAll('resourceIds').map(String) };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const res = await tx.select({ id: resources.id, facilityCode: resources.facilityCode }).from(resources);
    const allowed = new Set(res.filter((x) => !scope || scope.includes(x.facilityCode)).map((x) => x.id));
    const taken = new Set((await tx.select({ c: exclusionRules.code }).from(exclusionRules)).map((x) => x.c));
    const c = checkExclusionRule(raw, { taken, resources: allowed });
    if (!c.ok) return c;
    const { resourceIds, ...rule } = c.value;
    const [row] = await tx.insert(exclusionRules).values({ ...rule, proposedByName: v.name }).returning({ id: exclusionRules.id });
    await tx.insert(exclusionRuleResources).values(resourceIds.map((resourceId) => ({ ruleId: row.id, resourceId })));
    await writeAudit(tx, audit(v, 'Rules', `Rule ${rule.code}`, 'exclusion rule proposed', { entityType: 'exclusion_rule', entityId: row.id, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate('/rules', '/planning');
  return r;
}

/** The safety officer validates a proposed rule (R-3): from then on it refuses the bookings it forbids. */
export async function validateRuleAction(ruleId: string): Promise<ActionResult> {
  const v = await getViewer();
  if (v.role !== 'safety') return { ok: false, error: 'Only the safety officer validates an exclusion rule' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [rule] = await tx.select().from(exclusionRules).where(eq(exclusionRules.id, ruleId));
    if (!rule) return { ok: false, error: 'Unknown rule' };
    if (rule.status !== 'proposed') return { ok: false, error: 'This rule is not awaiting validation' };
    await tx.update(exclusionRules).set({ status: 'validated', validatedByName: v.name, validatedAt: new Date(), updatedAt: new Date() }).where(eq(exclusionRules.id, ruleId));
    await writeAudit(tx, audit(v, 'Rules', `Rule ${rule.code}`, 'status: proposed → validated', { entityType: 'exclusion_rule', entityId: rule.id }));
    return { ok: true };
  });
  if (r.ok) revalidate('/rules', '/planning');
  return r;
}

/** The safety officer retires a rule, with a reason (a new version replaces it, or the risk no longer exists). */
export async function retireRuleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (v.role !== 'safety') return { ok: false, error: 'Only the safety officer retires an exclusion rule' };
  const ruleId = String(fd.get('ruleId') ?? '');
  const reason = String(fd.get('reason') ?? '').trim();
  if (reason.length < 5) return { ok: false, error: 'Give the reason' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [rule] = await tx.select().from(exclusionRules).where(eq(exclusionRules.id, ruleId));
    if (!rule) return { ok: false, error: 'Unknown rule' };
    if (rule.status === 'retired') return { ok: true };
    await tx.update(exclusionRules).set({ status: 'retired', retiredByName: v.name, retiredAt: new Date(), retiredReason: reason, updatedAt: new Date() }).where(eq(exclusionRules.id, ruleId));
    await writeAudit(tx, audit(v, 'Rules', `Rule ${rule.code}`, `status: ${rule.status} → retired`, { entityType: 'exclusion_rule', entityId: rule.id, reason }));
    return { ok: true };
  });
  if (r.ok) revalidate('/rules', '/planning');
  return r;
}

/** Sharing agreement of a facility with a partner entity (A-3): the R&D director. */
export async function setAgreementAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (v.role !== 'rd_director') return { ok: false, error: 'Only the R&D director sets a sharing agreement' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const fp = await tx.select().from(facilityPartners);
    const facilityCode = String(fd.get('facilityCode') ?? '').toUpperCase();
    const c = checkAgreement(fieldsOf(fd), {
      facilities: new Set(fp.map((x) => x.facilityCode)),
      partners: new Set(fp.filter((x) => x.facilityCode === facilityCode).map((x) => x.entityCode)),
    });
    if (!c.ok) return c;
    const [before] = await tx.select().from(entityAgreements).where(and(eq(entityAgreements.facilityCode, c.value.facilityCode), eq(entityAgreements.entityCode, c.value.entityCode)));
    const row = { ...c.value, updatedByName: v.name, updatedAt: new Date() };
    await tx.insert(entityAgreements).values(row).onConflictDoUpdate({ target: [entityAgreements.facilityCode, entityAgreements.entityCode], set: row });
    await writeAudit(tx, audit(v, 'Rules', `Agreement ${c.value.facilityCode} · ${c.value.entityCode}`, before ? 'agreement updated' : 'agreement recorded', {
      before: before ? { quotaDaysPerMonth: before.quotaDaysPerMonth, noticeWorkdays: before.noticeWorkdays } : undefined, after: { ...c.value },
    }));
    return { ok: true };
  });
  if (r.ok) revalidate('/rules', '/dashboard');
  return r;
}

// ── Bookings ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The next booking reference of the year: "B-2026-0042" (under the write lock). */
async function nextRef(tx: Tx, year: string): Promise<string> {
  const [last] = await tx.select({ ref: bookings.ref }).from(bookings).where(like(bookings.ref, `B-${year}-%`)).orderBy(desc(bookings.ref)).limit(1);
  const n = last ? Number(last.ref.slice(7)) + 1 : 1;
  return `B-${year}-${String(n).padStart(4, '0')}`;
}

/** Loads the facts of the hard constraints of a slot on a resource, inside the transaction. */
async function contextOf(tx: Tx, res: typeof resources.$inferSelect, slot: { start: number; end: number }, entityCode: string, now: Date) {
  const cal = (await calendarsOf(tx, [res.facilityCode])).get(res.facilityCode)!;
  const rules = (await rulesOf(tx)).filter((r) => r.resourceIds.includes(res.id));
  const related = [...new Set([res.id, ...rules.flatMap((r) => r.resourceIds)])];
  const from = new Date(slot.start - 86_400_000);
  const to = new Date(slot.end + 86_400_000);
  const [bk, unav, insp, agreement] = await Promise.all([
    tx.select({ id: bookings.id, ref: bookings.ref, resourceId: bookings.resourceId, resourceCode: resources.code, start: bookings.startsAt, end: bookings.endsAt, status: bookings.status })
      .from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId))
      .where(and(inArray(bookings.resourceId, related), lt(bookings.startsAt, to), gte(bookings.endsAt, from), ne(bookings.status, 'cancelled'))),
    tx.select().from(unavailabilities).where(and(eq(unavailabilities.resourceId, res.id), lt(unavailabilities.startsAt, to), gte(unavailabilities.endsAt, from))),
    tx.select().from(inspections).where(and(eq(inspections.resourceId, res.id), eq(inspections.active, true))),
    tx.select().from(entityAgreements).where(and(eq(entityAgreements.facilityCode, res.facilityCode), eq(entityAgreements.entityCode, entityCode))),
  ]);
  return {
    resource: { id: res.id, code: res.code, status: res.status, capacity: res.capacity, granularity: res.granularity },
    hours: cal.hours.length ? cal.hours : DEFAULT_HOURS,
    closures: cal.closures,
    unavailabilities: unav.map((u) => ({ start: u.startsAt.getTime(), end: u.endsAt.getTime(), label: u.label })),
    inspections: insp.map((i) => ({ label: i.label, dueOn: inspectionDueOn(i.lastOn, i.periodMonths) })),
    bookings: bk.map((b) => ({ ...b, start: b.start.getTime(), end: b.end.getTime() })),
    rules: rules.map((r) => ({ code: r.code, maxActive: r.maxActive, status: r.status, resourceIds: r.resourceIds })),
    now: now.getTime(),
    noticeWorkdays: agreement[0]?.noticeWorkdays ?? DEFAULT_NOTICE_WORKDAYS,
  };
}

async function facilityFacts(tx: Tx, code: string) {
  const [f] = await tx.select().from(facilities).where(eq(facilities.code, code));
  const partners = (await tx.select().from(facilityPartners).where(eq(facilityPartners.facilityCode, code))).map((x) => x.entityCode);
  return f ? { code: f.code, operatorEntityCode: f.operatorEntityCode, partnerEntityCodes: partners } : null;
}

/** A request for a slot (spec 03 §6, level "request"): checked against every hard constraint; warnings are returned. */
export async function requestBookingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const raw = fieldsOf(fd);
  const title = checkTitle(raw.title);
  if (!title.ok) return title;
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [res] = await tx.select().from(resources).where(eq(resources.id, String(raw.resourceId ?? '')));
    const [proj] = await tx.select().from(projects).where(and(eq(projects.code, String(raw.projectCode ?? '')), eq(projects.active, true)));
    if (!res || !proj) return { ok: false, error: 'Choose a resource and a project' };
    const fac = await facilityFacts(tx, res.facilityCode);
    if (!fac || !canSeeFacility(facilityVisibility(v.role, v.assignments), fac)) return { ok: false, error: 'Choose a resource and a project' };
    if (!canRequestBooking(v.role, v.assignments, fac, proj)) return { ok: false, error: 'You may not book this resource for this project' };
    const slotIn = checkSlotInput(raw, res.granularity);
    if (!slotIn.ok) return slotIn;
    const cal = (await calendarsOf(tx, [res.facilityCode])).get(res.facilityCode)!;
    const slot = slotInterval(slotIn.value, res.granularity, cal.hours.length ? cal.hours : DEFAULT_HOURS, cal.closures);
    if (!slot) return { ok: false, error: ISSUE_LABEL.outside_hours };
    const check = checkBooking(slot, await contextOf(tx, res, slot, proj.entityCode, now));
    if (check.errors.length) return { ok: false, error: check.errors.map(issueText).join(' — ') };
    const needId = String(raw.needId ?? '') || null;
    if (needId) {
      const [need] = /^[0-9a-f-]{36}$/i.test(needId) ? await tx.select({ projectCode: testNeeds.projectCode, status: testNeeds.status }).from(testNeeds).where(eq(testNeeds.id, needId)) : [];
      if (!need || need.projectCode !== proj.code || need.status !== 'open') return { ok: false, error: 'Choose an open need of the project' };
    }
    const ref = await nextRef(tx, parisParts(new Date(slot.start)).iso.slice(0, 4));
    const operators = String(raw.operators ?? '').trim().slice(0, 200) || null;
    const [b] = await tx.insert(bookings).values({
      ref, resourceId: res.id, projectCode: proj.code, entityCode: proj.entityCode, title: title.value, startsAt: new Date(slot.start), endsAt: new Date(slot.end),
      setupMinutes: res.setupMinutes, teardownMinutes: res.teardownMinutes, status: 'requested', operators,
      requestedByUserId: v.userId, requestedByName: v.name, requestedAt: now, needId,
    }).returning({ id: bookings.id });
    await writeAudit(tx, audit(v, 'Bookings', `Booking ${ref}`, `requested: ${res.code}`, {
      entityType: 'booking', entityId: b.id, projectCode: proj.code,
      after: { resource: res.code, start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString(), needId, warnings: check.warnings.map((w) => w.code) },
    }));
    return { ok: true, warnings: check.warnings.map(issueText) };
  });
  if (r.ok) revalidate('/planning', '/my/schedule', '/', '/my/needs', '/load', `/projects/${raw.projectCode}`);
  return r;
}

/** Loads a booking with its resource for a transition by a person of the facility. */
async function bookingFor(tx: Tx, id: string) {
  const [row] = await tx.select({ b: bookings, res: resources }).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).where(eq(bookings.id, id));
  return row ?? null;
}

/** The coordinator or the facility manager confirms a request, after every hard constraint is checked again. */
export async function confirmBookingAction(id: string): Promise<ActionResult> {
  const v = await getViewer();
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const row = await bookingFor(tx, id);
    if (!row || !managedFacilities(v.role, v.assignments).includes(row.res.facilityCode)) return REFUSED;
    if (!canTransition(row.b.status, 'confirmed')) return { ok: false, error: 'This booking cannot be confirmed' };
    const slot = { id, start: row.b.startsAt.getTime(), end: row.b.endsAt.getTime() };
    const check = checkBooking(slot, { ...(await contextOf(tx, row.res, slot, row.b.entityCode, now)), noticeWorkdays: null });
    if (check.errors.length) return { ok: false, error: check.errors.map(issueText).join(' — ') };
    await tx.update(bookings).set({ status: 'confirmed', confirmedByName: v.name, confirmedAt: now, updatedAt: new Date() }).where(eq(bookings.id, id));
    await writeAudit(tx, audit(v, 'Bookings', `Booking ${row.b.ref}`, 'status: requested → confirmed', { entityType: 'booking', entityId: id, projectCode: row.b.projectCode }));
    await notify(tx, [row.b.requestedByUserId], { kind: 'booking_confirmed', title: `Booking confirmed · ${row.b.ref}`, href: `/projects/${encodeURIComponent(row.b.projectCode)}`, bookingId: row.b.id }, { except: v.userId, at: now });
    return { ok: true, warnings: check.warnings.map(issueText) };
  });
  if (r.ok) revalidate('/planning', '/my/schedule', '/');
  return r;
}

/** Cancels a booking not started: its requester, or a manager of the facility; the reason is kept. */
export async function cancelBookingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const id = String(fd.get('bookingId') ?? '');
  const reason = String(fd.get('reason') ?? '').trim();
  if (reason.length < 3) return { ok: false, error: 'Give the reason' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const row = await bookingFor(tx, id);
    if (!row) return REFUSED;
    const mine = row.b.requestedByUserId === v.userId || managedFacilities(v.role, v.assignments).includes(row.res.facilityCode);
    if (!mine) return REFUSED;
    if (!canTransition(row.b.status, 'cancelled')) return { ok: false, error: 'This booking can no longer be cancelled' };
    await tx.update(bookings).set({ status: 'cancelled', cancelReason: reason, updatedAt: new Date() }).where(eq(bookings.id, id));
    await writeAudit(tx, audit(v, 'Bookings', `Booking ${row.b.ref}`, `status: ${row.b.status} → cancelled`, { entityType: 'booking', entityId: id, projectCode: row.b.projectCode, reason }));
    await notify(tx, [row.b.requestedByUserId], { kind: 'booking_cancelled', title: `Booking cancelled · ${row.b.ref}`, href: `/projects/${encodeURIComponent(row.b.projectCode)}`, bookingId: row.b.id }, { except: v.userId });
    return { ok: true };
  });
  if (r.ok) revalidate('/planning', '/my/schedule', '/');
  return r;
}

/** Starts a test now (X-1): a technician or a manager of the facility. */
export async function startBookingAction(id: string): Promise<ActionResult> {
  const v = await getViewer();
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const row = await bookingFor(tx, id);
    if (!row || !operatedFacilities(v.role, v.assignments).includes(row.res.facilityCode)) return REFUSED;
    if (!canTransition(row.b.status, 'in_progress')) return { ok: false, error: 'This booking cannot be started' };
    await tx.update(bookings).set({ status: 'in_progress', actualStartAt: now, updatedAt: new Date() }).where(eq(bookings.id, id));
    await writeAudit(tx, audit(v, 'Bookings', `Booking ${row.b.ref}`, 'status: confirmed → in_progress', { entityType: 'booking', entityId: id, projectCode: row.b.projectCode }));
    return { ok: true };
  });
  if (r.ok) revalidate('/planning', '/my/schedule', '/dashboard');
  return r;
}

/**
 * Ends a test (X-1): now, or at the times typed when it is caught up at the end of the day (start and end the same Paris day
 * as the booking's start, within the booking's day).
 */
export async function finishBookingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const id = String(fd.get('bookingId') ?? '');
  const from = String(fd.get('actualFrom') ?? '').trim();
  const to = String(fd.get('actualTo') ?? '').trim();
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const row = await bookingFor(tx, id);
    if (!row || !operatedFacilities(v.role, v.assignments).includes(row.res.facilityCode)) return REFUSED;
    if (!canTransition(row.b.status, 'done')) return { ok: false, error: 'This booking cannot be ended' };
    const day = parisParts(row.b.startsAt).iso;
    let actualStart = row.b.actualStartAt ?? row.b.startsAt;
    let actualEnd = now;
    if (from || to) {
      if (!isHhmm(from) || !isHhmm(to) || to <= from) return { ok: false, error: 'Enter the actual start and end times (HH:MM)' };
      actualStart = parisInstant(day, from);
      actualEnd = parisInstant(parisParts(new Date(row.b.endsAt.getTime() - 1)).iso, to);
    }
    if (actualEnd <= actualStart || actualEnd > now) return { ok: false, error: 'The actual end comes after the start and not in the future' };
    await tx.update(bookings).set({ status: 'done', actualStartAt: actualStart, actualEndAt: actualEnd, updatedAt: new Date() }).where(eq(bookings.id, id));
    await writeAudit(tx, audit(v, 'Bookings', `Booking ${row.b.ref}`, `status: ${row.b.status} → done`, {
      entityType: 'booking', entityId: id, projectCode: row.b.projectCode, after: { actualStart: actualStart.toISOString(), actualEnd: actualEnd.toISOString() },
    }));
    return { ok: true };
  });
  if (r.ok) revalidate('/planning', '/my/schedule', '/dashboard');
  return r;
}

/** Releases a confirmed booking not started two hours after its start (A-7): a manager of the facility. */
export async function markNoShowAction(id: string): Promise<ActionResult> {
  const v = await getViewer();
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const row = await bookingFor(tx, id);
    if (!row || !managedFacilities(v.role, v.assignments).includes(row.res.facilityCode)) return REFUSED;
    if (!canMarkNoShow({ status: row.b.status, start: row.b.startsAt.getTime() }, now.getTime())) return { ok: false, error: 'Only a confirmed booking not started two hours after its start can be released' };
    await tx.update(bookings).set({ status: 'no_show', updatedAt: new Date() }).where(eq(bookings.id, id));
    await writeAudit(tx, audit(v, 'Bookings', `Booking ${row.b.ref}`, 'status: confirmed → no_show', { entityType: 'booking', entityId: id, projectCode: row.b.projectCode }));
    return { ok: true };
  });
  if (r.ok) revalidate('/planning', '/my/schedule', '/dashboard');
  return r;
}

/** Imports past bookings (F-9) of the coordinator's facilities, for the reference measure; never checked against today's rules. */
export async function importHistoryAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (v.role !== 'coordinator') return { ok: false, error: 'Only the coordinator imports the history' };
  const mine = managedFacilities(v.role, v.assignments);
  const today = await businessToday();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const res = await tx.select().from(resources).where(inArray(resources.facilityCode, mine.length ? mine : ['']));
    const projs = await tx.select().from(projects);
    const parsed = parseHistory(String(fd.get('csv') ?? ''), { resources: new Set(res.map((x) => x.code)), projects: new Set(projs.map((x) => x.code)), today });
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const byCode = new Map(res.map((x) => [x.code, x]));
    const entityOf = new Map(projs.map((p) => [p.code, p.entityCode]));
    let n = 0;
    for (const line of parsed.value) {
      const rr = byCode.get(line.resourceCode)!;
      const ref = await nextRef(tx, line.startOn.slice(0, 4));
      await tx.insert(bookings).values({
        ref, resourceId: rr.id, projectCode: line.projectCode, entityCode: entityOf.get(line.projectCode)!, title: line.title, startsAt: line.start, endsAt: line.end,
        setupMinutes: rr.setupMinutes, teardownMinutes: rr.teardownMinutes, status: line.status, actualStartAt: line.actualStart, actualEndAt: line.actualEnd,
        requestedByUserId: null, requestedByName: `${v.name} (import)`, requestedAt: line.start, source: 'import',
      });
      n++;
    }
    await writeAudit(tx, audit(v, 'Bookings', 'History import', `${n} past bookings imported`, { after: { count: n } }));
    return { ok: true, warnings: [`${n} past bookings imported`] };
  });
  if (r.ok) revalidate('/planning', '/dashboard');
  return r;
}
