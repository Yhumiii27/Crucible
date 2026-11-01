'use server';
// Maintenance and calibration plans of the resources (CR-073, X-12): kept by the coordinator or the manager of the facility
// (managedFacilities). A plan is added, an intervention recorded (append-only; it moves the plan's last date when later), a plan
// withdrawn (never deleted: its interventions stay). Each one checks the viewer's role and scope server-side inside its
// transaction, validates with the pure rules of src/domain/maintenance.ts, writes, audits and revalidates.
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { checkPlan, checkRecord, MAINTENANCE_KIND_LABEL } from '@/domain/maintenance';
import { managedFacilities } from '@/domain/rights';
import { businessToday } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { maintenancePlans, maintenanceRecords, resources } from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { getViewer, type Viewer } from '@/server/session';

export type ActionResult = { ok: true } | { ok: false; error: string };

const REFUSED: ActionResult = { ok: false, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fieldsOf = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
const audit = (v: Viewer, objectRef: string, change: string, extra: { entityId?: string; before?: Record<string, unknown>; after?: Record<string, unknown> } = {}) => ({
  actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef, change, area: 'Facilities', entityType: 'maintenance_plan', ...extra,
});

/** The resource, when the viewer keeps its facility. */
async function keptResource(tx: Tx, v: Viewer, resourceId: string) {
  if (!isUuid(resourceId)) return null;
  const [res] = await tx.select().from(resources).where(eq(resources.id, resourceId));
  return res && managedFacilities(v.role, v.assignments).includes(res.facilityCode) ? res : null;
}

/** The plan and its resource, when the viewer keeps its facility. */
async function keptPlan(tx: Tx, v: Viewer, planId: string) {
  if (!isUuid(planId)) return null;
  const [row] = await tx.select({ p: maintenancePlans, res: resources }).from(maintenancePlans).innerJoin(resources, eq(resources.id, maintenancePlans.resourceId)).where(eq(maintenancePlans.id, planId));
  return row && managedFacilities(v.role, v.assignments).includes(row.res.facilityCode) ? row : null;
}

const revalidate = (facilityCode: string) => {
  for (const p of [`/facilities/${facilityCode}`, '/planning', '/']) revalidatePath(p);
};

export async function createMaintenancePlanAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const c = checkPlan(fieldsOf(fd), await businessToday());
  if (!c.ok) return c;
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const res = await keptResource(tx, v, String(fd.get('resourceId') ?? ''));
    if (!res) return REFUSED;
    facilityCode = res.facilityCode;
    const [same] = await tx.select({ id: maintenancePlans.id }).from(maintenancePlans).where(and(eq(maintenancePlans.resourceId, res.id), eq(maintenancePlans.label, c.value.label)));
    if (same) return { ok: false, error: 'This resource already has a plan with this name' };
    const [p] = await tx.insert(maintenancePlans).values({ ...c.value, resourceId: res.id, updatedByName: v.name }).returning({ id: maintenancePlans.id });
    await writeAudit(tx, audit(v, `Resource ${res.code}`, `${MAINTENANCE_KIND_LABEL[c.value.kind]} planned: ${c.value.label} · ${c.value.periodMonths} months`, { entityId: p.id, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate(facilityCode);
  return r;
}

/** Records an intervention done: kept as recorded; the plan's last date moves to it when it is later. */
export async function recordMaintenanceAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const c = checkRecord(fieldsOf(fd), await businessToday());
  if (!c.ok) return c;
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const row = await keptPlan(tx, v, String(fd.get('planId') ?? ''));
    if (!row || !row.p.active) return REFUSED;
    facilityCode = row.res.facilityCode;
    await tx.insert(maintenanceRecords).values({ planId: row.p.id, ...c.value, provider: c.value.provider ?? row.p.provider, recordedByName: v.name });
    if (c.value.doneOn > row.p.lastOn) await tx.update(maintenancePlans).set({ lastOn: c.value.doneOn, updatedByName: v.name, updatedAt: new Date() }).where(eq(maintenancePlans.id, row.p.id));
    await writeAudit(tx, audit(v, `Resource ${row.res.code}`, `intervention recorded: ${row.p.label} · ${c.value.doneOn}`, {
      entityId: row.p.id, before: { lastOn: row.p.lastOn }, after: { ...c.value },
    }));
    return { ok: true };
  });
  if (r.ok) revalidate(facilityCode);
  return r;
}

/** Withdraws a plan (the resource no longer needs it): it no longer blocks nor alerts; its interventions stay. */
export async function withdrawMaintenancePlanAction(planId: string): Promise<ActionResult> {
  const v = await getViewer();
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const row = await keptPlan(tx, v, planId);
    if (!row || !row.p.active) return REFUSED;
    facilityCode = row.res.facilityCode;
    await tx.update(maintenancePlans).set({ active: false, updatedByName: v.name, updatedAt: new Date() }).where(eq(maintenancePlans.id, row.p.id));
    await writeAudit(tx, audit(v, `Resource ${row.res.code}`, `plan withdrawn: ${row.p.label}`, { entityId: row.p.id }));
    return { ok: true };
  });
  if (r.ok) revalidate(facilityCode);
  return r;
}
