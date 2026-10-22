'use server';
// Server Functions of delivery 3 (docs/spec/02 §3, 03 §6): milestones of a project and its test needs — entered by the R&D
// director, the coordinator, the project's lead or the partner contact of its entity (canManageNeeds, F-13) —, the test type
// catalogue (coordinator, R&D director) and the Codex reference of a test report (P-4, S-6). Each one checks the viewer's active
// role and scope server-side, re-reads what it touches inside its transaction (writes are serialised by the write lock),
// validates with the pure rules of src/domain/needs.ts, writes, audits and revalidates.
import { and, desc, eq, like, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { ISSUE_LABEL } from '@/domain/booking';
import { checkMilestone, checkNeed, checkTestType, DEFAULT_NOTICE_WORKDAYS, isLateRequest, type NeedInput } from '@/domain/needs';
import { canEditTestTypes, canManageNeeds, canSeeFacility, facilityVisibility, operatedFacilities } from '@/domain/rights';
import { parisParts } from '@/lib/dates';
import { businessNow, businessToday } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { bookings, entityAgreements, facilities, facilityPartners, projectMilestones, projects, resources, testNeeds, testTypes } from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { getViewer, type Viewer } from '@/server/session';

export type ActionResult = { ok: true; warnings?: string[] } | { ok: false; error: string };

const fieldsOf = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
const audit = (v: Viewer, area: string, objectRef: string, change: string, extra: { entityType?: string; entityId?: string; projectCode?: string; before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string } = {}) => ({
  actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef, change, area, ...extra,
});
const REFUSED: ActionResult = { ok: false, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function revalidate(projectCode: string) {
  for (const p of [`/projects/${projectCode}`, '/my/needs', '/load', '/']) revalidatePath(p);
}

/** The active project the viewer may enter milestones and needs for, else null. */
async function managedProject(tx: Tx, v: Viewer, code: string) {
  const [p] = await tx.select().from(projects).where(and(eq(projects.code, code), eq(projects.active, true)));
  return p && canManageNeeds(v.role, v.assignments, p) ? p : null;
}

// ── Milestones ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function addMilestoneAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const c = checkMilestone(fieldsOf(fd));
  if (!c.ok) return c;
  const code = String(fd.get('projectCode') ?? '');
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    if (!(await managedProject(tx, v, code))) return REFUSED;
    const [m] = await tx.insert(projectMilestones).values({ ...c.value, projectCode: code, updatedByName: v.name }).returning({ id: projectMilestones.id });
    await writeAudit(tx, audit(v, 'Projects', `Project ${code}`, `milestone added: ${c.value.label} · ${c.value.dueOn}`, { entityType: 'milestone', entityId: m.id, projectCode: code, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate(code);
  return r;
}

/** Changes a milestone entered in Crucible (a milestone read from Keystone is changed there). */
export async function updateMilestoneAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const c = checkMilestone(fieldsOf(fd));
  if (!c.ok) return c;
  const id = String(fd.get('milestoneId') ?? '');
  if (!isUuid(id)) return REFUSED;
  const db = await getDb();
  let code = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [m] = await tx.select().from(projectMilestones).where(eq(projectMilestones.id, id));
    if (!m || !(await managedProject(tx, v, m.projectCode))) return REFUSED;
    if (m.source !== 'crucible') return { ok: false, error: 'This milestone comes from Keystone: change it there' };
    code = m.projectCode;
    await tx.update(projectMilestones).set({ ...c.value, updatedByName: v.name, updatedAt: new Date() }).where(eq(projectMilestones.id, id));
    await writeAudit(tx, audit(v, 'Projects', `Project ${code}`, `milestone changed: ${m.label} · ${m.dueOn} → ${c.value.label} · ${c.value.dueOn}`, {
      entityType: 'milestone', entityId: id, projectCode: code, before: { label: m.label, dueOn: m.dueOn, criticality: m.criticality }, after: { ...c.value },
    }));
    return { ok: true };
  });
  if (r.ok) revalidate(code);
  return r;
}

/** Removes a milestone no need serves. */
export async function removeMilestoneAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const db = await getDb();
  let code = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [m] = await tx.select().from(projectMilestones).where(eq(projectMilestones.id, id));
    if (!m || !(await managedProject(tx, v, m.projectCode))) return REFUSED;
    if (m.source !== 'crucible') return { ok: false, error: 'This milestone comes from Keystone: change it there' };
    const used = await tx.select({ ref: testNeeds.ref }).from(testNeeds).where(eq(testNeeds.milestoneId, id));
    if (used.length) return { ok: false, error: `Needs serve this milestone · ${used.map((u) => u.ref).join(', ')}` };
    code = m.projectCode;
    await tx.delete(projectMilestones).where(eq(projectMilestones.id, id));
    await writeAudit(tx, audit(v, 'Projects', `Project ${code}`, `milestone removed: ${m.label} · ${m.dueOn}`, { entityType: 'milestone', entityId: id, projectCode: code, before: { label: m.label, dueOn: m.dueOn, criticality: m.criticality } }));
    return { ok: true };
  });
  if (r.ok) revalidate(code);
  return r;
}

// ── Test needs ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** "N-2026-0007": the next need reference of the year (under the write lock). */
async function nextNeedRef(tx: Tx, year: string): Promise<string> {
  const [last] = await tx.select({ ref: testNeeds.ref }).from(testNeeds).where(like(testNeeds.ref, `N-${year}-%`)).orderBy(desc(testNeeds.ref)).limit(1);
  const n = last ? Number(last.ref.slice(7)) + 1 : 1;
  return `N-${year}-${String(n).padStart(4, '0')}`;
}

/** What a need of the project may refer to, as the viewer sees it: resources of the visible facilities, the project's milestones, the catalogue. */
async function needContext(tx: Tx, v: Viewer, projectCode: string, today: string) {
  const vis = facilityVisibility(v.role, v.assignments);
  const [facs, partners, res, ms, types] = await Promise.all([
    tx.select().from(facilities).where(eq(facilities.active, true)),
    tx.select().from(facilityPartners),
    tx.select({ id: resources.id, facilityCode: resources.facilityCode }).from(resources).where(ne(resources.status, 'retired')),
    tx.select({ id: projectMilestones.id, dueOn: projectMilestones.dueOn }).from(projectMilestones).where(eq(projectMilestones.projectCode, projectCode)),
    tx.select({ code: testTypes.code }).from(testTypes).where(eq(testTypes.active, true)),
  ]);
  const visible = new Set(facs.filter((f) => canSeeFacility(vis, { code: f.code, operatorEntityCode: f.operatorEntityCode, partnerEntityCodes: partners.filter((p) => p.facilityCode === f.code).map((p) => p.entityCode) })).map((f) => f.code));
  return {
    resources: new Set(res.filter((r) => visible.has(r.facilityCode)).map((r) => r.id)),
    facilityOf: new Map(res.map((r) => [r.id, r.facilityCode])),
    milestones: new Map(ms.map((m) => [m.id, { dueOn: m.dueOn }])),
    testTypes: new Set(types.map((x) => x.code)),
    today,
  };
}

/** Working days of notice asked of an entity on a facility: its agreement's, else the rule for everyone (F-5). */
async function noticeOf(tx: Tx, facilityCode: string, entityCode: string): Promise<number> {
  const [a] = await tx.select({ n: entityAgreements.noticeWorkdays }).from(entityAgreements).where(and(eq(entityAgreements.facilityCode, facilityCode), eq(entityAgreements.entityCode, entityCode)));
  return a?.n ?? DEFAULT_NOTICE_WORKDAYS;
}

async function needWarnings(tx: Tx, n: NeedInput, facilityCode: string, entityCode: string, today: string, warnings: string[] = []): Promise<string[]> {
  const late = n.level === 'request' && isLateRequest(today, n.earliestOn, await noticeOf(tx, facilityCode, entityCode));
  return late ? [...warnings, ISSUE_LABEL.late_request] : warnings;
}

export async function createNeedAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const [today, now] = await Promise.all([businessToday(), businessNow()]);
  const code = String(fd.get('projectCode') ?? '');
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const proj = await managedProject(tx, v, code);
    if (!proj) return REFUSED;
    const ctx = await needContext(tx, v, code, today);
    const c = checkNeed(fieldsOf(fd), ctx);
    if (!c.ok) return c;
    const ref = await nextNeedRef(tx, parisParts(now).iso.slice(0, 4));
    const [row] = await tx.insert(testNeeds).values({ ...c.value, ref, projectCode: code, requestedByUserId: v.userId, requestedByName: v.name, requestedAt: now }).returning({ id: testNeeds.id });
    const warnings = await needWarnings(tx, c.value, ctx.facilityOf.get(c.value.resourceId)!, proj.entityCode, today, c.warnings);
    await writeAudit(tx, audit(v, 'Needs', `Need ${ref}`, `${c.value.level} recorded: ${c.value.halfDays} half-days · ${c.value.earliestOn} → ${c.value.deadlineOn}`, {
      entityType: 'need', entityId: row.id, projectCode: code, after: { ...c.value, warnings },
    }));
    return { ok: true, warnings };
  });
  if (r.ok) revalidate(code);
  return r;
}

/** Changes an open need: its level (a forecast becomes a request), length, dates, resource, references. */
export async function updateNeedAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const today = await businessToday();
  const id = String(fd.get('needId') ?? '');
  if (!isUuid(id)) return REFUSED;
  const db = await getDb();
  let code = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [n] = await tx.select().from(testNeeds).where(eq(testNeeds.id, id));
    const proj = n ? await managedProject(tx, v, n.projectCode) : null;
    if (!n || !proj) return REFUSED;
    if (n.status !== 'open') return { ok: false, error: 'This need has been withdrawn' };
    code = n.projectCode;
    const ctx = await needContext(tx, v, code, today);
    const c = checkNeed(fieldsOf(fd), ctx);
    if (!c.ok) return c;
    await tx.update(testNeeds).set({ ...c.value, updatedAt: new Date() }).where(eq(testNeeds.id, id));
    const before = { level: n.level, title: n.title, resourceId: n.resourceId, halfDays: n.halfDays, earliestOn: n.earliestOn, deadlineOn: n.deadlineOn, milestoneId: n.milestoneId, testTypeCode: n.testTypeCode, codexRef: n.codexRef, note: n.note };
    const changed = Object.keys(before).filter((k) => before[k as keyof typeof before] !== c.value[k as keyof NeedInput]);
    const warnings = await needWarnings(tx, c.value, ctx.facilityOf.get(c.value.resourceId)!, proj.entityCode, today, c.warnings);
    await writeAudit(tx, audit(v, 'Needs', `Need ${n.ref}`, n.level !== c.value.level ? `level: ${n.level} → ${c.value.level}` : `changed: ${changed.join(', ') || 'nothing'}`, {
      entityType: 'need', entityId: id, projectCode: code, before, after: { ...c.value },
    }));
    return { ok: true, warnings };
  });
  if (r.ok) revalidate(code);
  return r;
}

/** Withdraws an open need, with the reason; its bookings stay as they are (cancelling them is a separate act). */
export async function withdrawNeedAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const id = String(fd.get('needId') ?? '');
  if (!isUuid(id)) return REFUSED;
  const reason = String(fd.get('reason') ?? '').trim();
  if (reason.length < 3) return { ok: false, error: 'Give the reason' };
  const db = await getDb();
  let code = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [n] = await tx.select().from(testNeeds).where(eq(testNeeds.id, id));
    if (!n || !(await managedProject(tx, v, n.projectCode))) return REFUSED;
    if (n.status !== 'open') return { ok: true };
    code = n.projectCode;
    await tx.update(testNeeds).set({ status: 'withdrawn', withdrawnReason: reason, updatedAt: new Date() }).where(eq(testNeeds.id, id));
    await writeAudit(tx, audit(v, 'Needs', `Need ${n.ref}`, 'status: open → withdrawn', { entityType: 'need', entityId: id, projectCode: code, reason }));
    return { ok: true };
  });
  if (r.ok) revalidate(code);
  return r;
}

// ── Test type catalogue ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function createTestTypeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (!canEditTestTypes(v.role)) return { ok: false, error: 'Only the coordinator or the R&D director keeps the test type catalogue' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const taken = new Set((await tx.select({ c: testTypes.code }).from(testTypes)).map((x) => x.c));
    const res = new Set((await tx.select({ id: resources.id }).from(resources).where(ne(resources.status, 'retired'))).map((x) => x.id));
    const c = checkTestType(fieldsOf(fd), { taken, resources: res });
    if (!c.ok) return c;
    await tx.insert(testTypes).values({ ...c.value, updatedByName: v.name });
    await writeAudit(tx, audit(v, 'Rules', `Test type ${c.value.code}`, 'test type created', { entityType: 'test_type', after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/rules');
  return r;
}

export async function setTestTypeActiveAction(code: string, active: boolean): Promise<ActionResult> {
  const v = await getViewer();
  if (!canEditTestTypes(v.role)) return { ok: false, error: 'Only the coordinator or the R&D director keeps the test type catalogue' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [x] = await tx.select().from(testTypes).where(eq(testTypes.code, code));
    if (!x) return { ok: false, error: 'Unknown test type' };
    if (x.active === active) return { ok: true };
    await tx.update(testTypes).set({ active, updatedByName: v.name, updatedAt: new Date() }).where(eq(testTypes.code, code));
    await writeAudit(tx, audit(v, 'Rules', `Test type ${code}`, active ? 'test type restored' : 'test type withdrawn from the catalogue', { entityType: 'test_type' }));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/rules');
  return r;
}

// ── Test report ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Records the Codex reference of a done test's report (P-4, S-6): the people running the facility, or those who enter the project's needs. */
export async function setReportRefAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const id = String(fd.get('bookingId') ?? '');
  if (!isUuid(id)) return REFUSED;
  const codexRef = String(fd.get('codexRef') ?? '').trim();
  if (codexRef.length < 2 || codexRef.length > 60) return { ok: false, error: 'Enter the Codex reference of the report' };
  const db = await getDb();
  let code = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select({ b: bookings, facilityCode: resources.facilityCode }).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).where(eq(bookings.id, id));
    if (!row) return REFUSED;
    const runs = operatedFacilities(v.role, v.assignments).includes(row.facilityCode);
    if (!runs && !(await managedProject(tx, v, row.b.projectCode))) return REFUSED;
    if (row.b.status !== 'done') return { ok: false, error: 'Only a done test has a report' };
    code = row.b.projectCode;
    await tx.update(bookings).set({ codexRef, updatedAt: new Date() }).where(eq(bookings.id, id));
    await writeAudit(tx, audit(v, 'Bookings', `Booking ${row.b.ref}`, `test report: ${codexRef}`, { entityType: 'booking', entityId: id, projectCode: code, before: { codexRef: row.b.codexRef }, after: { codexRef } }));
    return { ok: true };
  });
  if (r.ok) revalidate(code);
  return r;
}

