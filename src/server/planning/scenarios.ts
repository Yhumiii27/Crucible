import 'server-only';
// Scenarios (docs/spec/03 §7, decisions A-8, F-4; delivery 5): built inside the caller's transaction from the engine's input
// (./engine-run.ts) and the pure rules of src/domain/recovery.ts — a recovery scenario after an incident, an urgency scenario,
// a what-if simulation — and applied only when a person accepts it: each move is checked again against what holds now, the
// booking is moved with its people and equipment, audited, and its requester notified. A move that no longer fits is skipped and
// reported; nothing else changes.
import { and, desc, eq, gte, inArray, like } from 'drizzle-orm';
import { checkBooking, ISSUE_LABEL } from '@/domain/booking';
import type { EngineInput } from '@/domain/engine';
import { touchedBookings, replan, urgencyPlan, type Impact, type Move, type MovableBooking } from '@/domain/recovery';
import type { ScenarioKind, ScenarioStatus } from '@/domain/recovery-vocabulary';
import { parisInstant, parisParts } from '@/lib/dates';
import { writeAudit } from '@/server/db/helpers';
import {
  bookingEquipment, bookingStaff, bookings, incidents, projectMilestones, projects, resources, scenarios, testNeeds,
} from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { notify } from '@/server/notify';
import { engineInput, type RunBy } from './engine-run';
import { slotFacts } from './slot-facts';

const ms = (d: Date) => d.getTime();

/** The bookings a scenario may move: confirmed, not started, from today on, with their need, people and equipment. */
export async function movableBookings(tx: Tx, today: string): Promise<MovableBooking[]> {
  const rows = await tx.select({
    b: bookings, code: resources.code, priorityClass: projects.priorityClass, entityCode: projects.entityCode,
    needRef: testNeeds.ref, deadlineOn: testNeeds.deadlineOn, testTypeCode: testNeeds.testTypeCode, needRequestedAt: testNeeds.requestedAt, criticality: projectMilestones.criticality,
  }).from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(projects, eq(projects.code, bookings.projectCode))
    .leftJoin(testNeeds, eq(testNeeds.id, bookings.needId)).leftJoin(projectMilestones, eq(projectMilestones.id, testNeeds.milestoneId))
    .where(and(eq(bookings.status, 'confirmed'), gte(bookings.endsAt, parisInstant(today, '00:00'))));
  const ids = rows.map((r) => r.b.id);
  const [staff, equip] = await Promise.all([
    ids.length ? tx.select().from(bookingStaff).where(inArray(bookingStaff.bookingId, ids)) : [],
    ids.length ? tx.select().from(bookingEquipment).where(inArray(bookingEquipment.bookingId, ids)) : [],
  ]);
  return rows.map((r) => ({
    id: r.b.id, ref: r.b.ref, resourceId: r.b.resourceId, resourceCode: r.code, start: ms(r.b.startsAt), end: ms(r.b.endsAt), status: r.b.status,
    projectCode: r.b.projectCode, needId: r.b.needId, needRef: r.needRef, testTypeCode: r.testTypeCode,
    deadlineOn: r.deadlineOn ?? parisParts(new Date(ms(r.b.endsAt) - 1)).iso,
    facts: { priorityClass: r.priorityClass, criticality: r.criticality ?? null, requestedAt: ms(r.needRequestedAt ?? r.b.requestedAt), entityCode: r.entityCode },
    staff: staff.filter((s) => s.bookingId === r.b.id).map((s) => ({ personId: s.personId, skillCode: s.skillCode ?? '' })),
    equipment: equip.filter((e) => e.bookingId === r.b.id).map((e) => e.equipmentCode),
  }));
}

async function nextScenarioRef(tx: Tx, year: string): Promise<string> {
  const [last] = await tx.select({ ref: scenarios.ref }).from(scenarios).where(like(scenarios.ref, `S-${year}-%`)).orderBy(desc(scenarios.ref)).limit(1);
  return `S-${year}-${String(last ? Number(last.ref.slice(7)) + 1 : 1).padStart(4, '0')}`;
}

export type ScenarioSource =
  | { kind: 'breakdown'; resourceId: string; start: Date; end: Date; label: string; hypothetical?: boolean }
  | { kind: 'absence'; personId: string; fromOn: string; toOn: string; hypothetical?: boolean }
  | { kind: 'urgency'; needId: string };

export interface BuiltScenario {
  kind: ScenarioKind;
  moves: Move[];
  impacts: Impact[];
  /** Urgency: the slot of the urgent test (null when it cannot be placed). */
  urgentSlot: { resourceId: string; start: number; end: number; staff: { personId: string; skillCode: string }[]; equipment: string[] } | null;
  ruleVersion: number;
}

/** Builds the scenario of an incident, an urgency or a hypothesis (what-if), from what holds now. */
export async function buildScenario(tx: Tx, source: ScenarioSource, today: string, now: Date): Promise<BuiltScenario> {
  const ctx = await engineInput(tx, today, now);
  const movable = await movableBookings(tx, today);
  let input: EngineInput = ctx.input;
  const kind: ScenarioKind = source.kind === 'urgency' ? 'urgency' : 'hypothetical' in source && source.hypothetical ? 'what_if' : 'recovery';
  if (source.kind === 'breakdown') {
    const window = { start: source.start.getTime(), end: source.end.getTime() };
    if (source.hypothetical) input = { ...input, unavailabilities: [...input.unavailabilities, { resourceId: source.resourceId, label: source.label, ...window }] };
    const touched = touchedBookings(movable, window, { resourceIds: [source.resourceId] });
    const earliest = parisParts(source.start).iso > input.fromOn ? parisParts(source.start).iso : input.fromOn;
    return { kind, ...replan(input, touched, earliest), urgentSlot: null, ruleVersion: ctx.ruleVersion };
  }
  if (source.kind === 'absence') {
    if (source.hypothetical) input = { ...input, people: input.people.map((p) => (p.id === source.personId ? { ...p, absences: [...p.absences, { fromOn: source.fromOn, toOn: source.toOn }] } : p)) };
    const window = { start: parisInstant(source.fromOn, '00:00').getTime(), end: parisInstant(source.toOn, '23:59').getTime() };
    const touched = touchedBookings(movable, window, { personId: source.personId });
    const earliest = source.fromOn > input.fromOn ? source.fromOn : input.fromOn;
    return { kind, ...replan(input, touched, earliest), urgentSlot: null, ruleVersion: ctx.ruleVersion };
  }
  const urgent = input.needs.find((n) => n.id === source.needId);
  if (!urgent) return { kind, moves: [], impacts: [], urgentSlot: null, ruleVersion: ctx.ruleVersion };
  const r = urgencyPlan(input, urgent, movable, input.fromOn);
  return { kind, moves: r.moves, impacts: r.impacts, urgentSlot: r.slot, ruleVersion: ctx.ruleVersion };
}

/** Records a scenario: `submitted` for a decision, or `simulation` (never applied). */
export async function saveScenario(tx: Tx, s: BuiltScenario, opts: { incidentId: string | null; hypothesis?: Record<string, unknown>; status: ScenarioStatus; by: RunBy; now: Date }) {
  const ref = await nextScenarioRef(tx, parisParts(opts.now).iso.slice(0, 4));
  const [row] = await tx.insert(scenarios).values({
    ref, kind: s.kind, incidentId: opts.incidentId, hypothesis: { ...(opts.hypothesis ?? {}), ...(s.urgentSlot ? { urgentSlot: s.urgentSlot } : {}) },
    moves: s.moves as unknown as Record<string, unknown>[], impacts: s.impacts as unknown as Record<string, unknown>[], ruleVersion: s.ruleVersion,
    status: opts.status, createdByName: opts.by.name, createdAt: opts.now,
  }).returning({ id: scenarios.id });
  return { id: row.id, ref };
}

/**
 * Applies an accepted scenario: each move is checked again (hard constraints of its new slot against what holds now, the
 * booking itself excepted) and the booking moved with its new people and equipment; an urgency also books the urgent test.
 * Returns the moves skipped with their reason. Requesters are notified of their moved test.
 */
export async function applyScenario(tx: Tx, scenarioId: string, by: RunBy & { userId: string | null }, now: Date): Promise<{ moved: number; skipped: string[]; urgentRef: string | null }> {
  const [sc] = await tx.select().from(scenarios).where(eq(scenarios.id, scenarioId));
  const moves = sc.moves as unknown as Move[];
  const skipped: string[] = [];
  let moved = 0;
  for (const m of moves) {
    if (!m.to) {
      skipped.push(`${m.ref} · No free slot in the horizon`);
      continue;
    }
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, m.bookingId));
    if (!b || b.status !== 'confirmed') {
      skipped.push(`${m.ref} · This booking cannot be moved`);
      continue;
    }
    const slot = { id: b.id, start: m.to.start, end: m.to.end };
    const { res, ctx } = await slotFacts(tx, m.to.resourceId, slot);
    const check = checkBooking(slot, { ...ctx, now: now.getTime(), noticeWorkdays: null });
    if (check.errors.length) {
      skipped.push(`${m.ref} · ${check.errors.map((e) => (e.ref ? `${ISSUE_LABEL[e.code]} · ${e.ref}` : ISSUE_LABEL[e.code])).join(' — ')}`);
      continue;
    }
    await tx.update(bookings).set({ resourceId: m.to.resourceId, startsAt: new Date(m.to.start), endsAt: new Date(m.to.end), setupMinutes: res.setupMinutes, teardownMinutes: res.teardownMinutes, updatedAt: new Date() }).where(eq(bookings.id, b.id));
    await tx.delete(bookingStaff).where(eq(bookingStaff.bookingId, b.id));
    await tx.delete(bookingEquipment).where(eq(bookingEquipment.bookingId, b.id));
    if (m.staff.length) await tx.insert(bookingStaff).values(m.staff.map((s) => ({ bookingId: b.id, personId: s.personId, skillCode: s.skillCode || null })));
    if (m.equipment.length) await tx.insert(bookingEquipment).values(m.equipment.map((equipmentCode) => ({ bookingId: b.id, equipmentCode })));
    await writeAudit(tx, {
      actorName: by.name, actorUserId: by.userId, actorRole: by.role, objectRef: `Booking ${b.ref}`, area: 'Bookings', change: `moved by scenario ${sc.ref}: ${res.code}`,
      entityType: 'booking', entityId: b.id, projectCode: b.projectCode,
      before: { resourceId: b.resourceId, start: b.startsAt.toISOString(), end: b.endsAt.toISOString() },
      after: { resourceId: m.to.resourceId, start: new Date(m.to.start).toISOString(), end: new Date(m.to.end).toISOString(), substitute: m.to.substitute },
    });
    await notify(tx, [b.requestedByUserId], { kind: 'booking_moved', title: `Your test was moved · ${b.ref} · ${sc.ref}`, href: `/projects/${encodeURIComponent(b.projectCode)}` }, { except: by.userId, at: now });
    moved++;
  }
  let urgentRef: string | null = null;
  const slot = (sc.hypothesis as { urgentSlot?: BuiltScenario['urgentSlot'] } | null)?.urgentSlot;
  if (sc.kind === 'urgency' && slot) urgentRef = await bookUrgent(tx, sc.ref, slot, sc.incidentId, by, now, skipped);
  return { moved, skipped, urgentRef };
}

async function bookUrgent(tx: Tx, scenarioRef: string, slot: NonNullable<BuiltScenario['urgentSlot']>, incidentId: string | null, by: RunBy & { userId: string | null }, now: Date, skipped: string[]): Promise<string | null> {
  const [inc] = incidentId ? await tx.select().from(incidents).where(eq(incidents.id, incidentId)) : [];
  if (!inc?.needId) return null;
  const [n] = await tx.select({ n: testNeeds, entityCode: projects.entityCode }).from(testNeeds).innerJoin(projects, eq(projects.code, testNeeds.projectCode)).where(eq(testNeeds.id, inc.needId));
  const { res, ctx } = await slotFacts(tx, slot.resourceId, slot);
  const check = checkBooking(slot, { ...ctx, now: now.getTime(), noticeWorkdays: null });
  if (check.errors.length) {
    skipped.push(`${n.n.ref} · ${check.errors.map((e) => ISSUE_LABEL[e.code]).join(' — ')}`);
    return null;
  }
  const year = parisParts(new Date(slot.start)).iso.slice(0, 4);
  const [last] = await tx.select({ ref: bookings.ref }).from(bookings).where(like(bookings.ref, `B-${year}-%`)).orderBy(desc(bookings.ref)).limit(1);
  const ref = `B-${year}-${String(last ? Number(last.ref.slice(7)) + 1 : 1).padStart(4, '0')}`;
  const [b] = await tx.insert(bookings).values({
    ref, resourceId: slot.resourceId, projectCode: n.n.projectCode, entityCode: n.entityCode, title: n.n.title, startsAt: new Date(slot.start), endsAt: new Date(slot.end),
    setupMinutes: res.setupMinutes, teardownMinutes: res.teardownMinutes, status: 'confirmed', requestedByUserId: n.n.requestedByUserId, requestedByName: n.n.requestedByName,
    requestedAt: n.n.requestedAt, confirmedByName: by.name, confirmedAt: now, needId: n.n.id,
  }).returning({ id: bookings.id });
  if (slot.staff.length) await tx.insert(bookingStaff).values(slot.staff.map((s) => ({ bookingId: b.id, personId: s.personId, skillCode: s.skillCode })));
  if (slot.equipment.length) await tx.insert(bookingEquipment).values(slot.equipment.map((equipmentCode) => ({ bookingId: b.id, equipmentCode })));
  await writeAudit(tx, {
    actorName: by.name, actorUserId: by.userId, actorRole: by.role, objectRef: `Booking ${ref}`, area: 'Bookings', change: `urgent test booked by scenario ${scenarioRef}: ${res.code}`,
    entityType: 'booking', entityId: b.id, projectCode: n.n.projectCode, after: { need: n.n.ref, start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString() },
  });
  await notify(tx, [n.n.requestedByUserId], { kind: 'booking_confirmed', title: `Booking confirmed · ${ref} · ${n.n.ref}`, href: `/projects/${encodeURIComponent(n.n.projectCode)}` }, { except: by.userId, at: now });
  return ref;
}
