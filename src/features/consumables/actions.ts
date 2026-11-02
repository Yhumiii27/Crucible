'use server';
// Server Functions of the consumables (CR-076, X-20), for a facility's managers (coordinator, facility manager): declare a
// consumable (or change its name, unit, threshold, or set it aside), receive a lot, correct the stock (count adjustment or
// discard, with the reason; a move is never changed), set the quantity a test type needs per test (0 removes it). Audited.
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { checkConsumable, checkCorrection, checkReceipt, quantityOf } from '@/domain/consumables';
import { managedFacilities } from '@/domain/rights';
import { parisParts } from '@/lib/dates';
import { businessNow } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { consumableLots, consumableMoves, consumables, testTypeConsumables, testTypes } from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { getViewer, type Viewer } from '@/server/session';

export type ActionResult = { ok: true } | { ok: false; error: string };

const REFUSED: ActionResult = { ok: false, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const audit = (v: Viewer, facilityCode: string, change: string, entityId: string) => ({
  actorName: v.name, actorUserId: v.userId, actorRole: v.role, area: 'Facilities', objectRef: `Facility ${facilityCode}`, change, entityType: 'consumable', entityId,
});

/** The consumable, when the viewer manages its facility. */
async function managed(tx: Tx, v: Viewer, id: string) {
  if (!isUuid(id)) return null;
  const [c] = await tx.select().from(consumables).where(eq(consumables.id, id));
  return c && managedFacilities(v.role, v.assignments).includes(c.facilityCode) ? c : null;
}

export async function saveConsumableAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const id = String(fd.get('id') ?? '');
  const facilityCode = String(fd.get('facilityCode') ?? '');
  const c = checkConsumable({ name: fd.get('name'), unit: fd.get('unit'), threshold: fd.get('threshold') });
  if (!c.ok) return c;
  const db = await getDb();
  let fac = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    if (id) {
      const cur = await managed(tx, v, id);
      if (!cur) return REFUSED;
      fac = cur.facilityCode;
      const active = fd.get('active') === 'on';
      await tx.update(consumables).set({ ...c.value, active, updatedByName: v.name, updatedAt: new Date() }).where(eq(consumables.id, id));
      await writeAudit(tx, audit(v, fac, `consumable changed: ${c.value.name}${active ? '' : ' (set aside)'}`, id));
      return { ok: true };
    }
    if (!managedFacilities(v.role, v.assignments).includes(facilityCode)) return REFUSED;
    fac = facilityCode;
    const [row] = await tx.insert(consumables).values({ facilityCode, ...c.value, updatedByName: v.name }).returning({ id: consumables.id });
    await writeAudit(tx, audit(v, fac, `consumable added: ${c.value.name} (${c.value.unit})`, row.id));
    return { ok: true };
  });
  if (r.ok) revalidatePath(`/facilities/${fac}`);
  return r;
}

export async function receiveLotAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const now = await businessNow();
  const db = await getDb();
  let fac = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const c = await managed(tx, v, String(fd.get('consumableId') ?? ''));
    if (!c) return REFUSED;
    const x = checkReceipt({ lotRef: fd.get('lotRef'), quantity: fd.get('quantity'), expiresOn: fd.get('expiresOn') }, parisParts(now).iso);
    if (!x.ok) return x;
    fac = c.facilityCode;
    const [lot] = await tx.insert(consumableLots).values({ consumableId: c.id, lotRef: x.value.lotRef, expiresOn: x.value.expiresOn, receivedByName: v.name, receivedAt: now }).returning({ id: consumableLots.id });
    await tx.insert(consumableMoves).values({ consumableId: c.id, lotId: lot.id, kind: 'receipt', quantity: x.value.quantity, byName: v.name, at: now });
    await writeAudit(tx, audit(v, fac, `lot received: ${c.name} · ${x.value.lotRef} · ${x.value.quantity} ${c.unit}${x.value.expiresOn ? ` · expires ${x.value.expiresOn}` : ''}`, c.id));
    return { ok: true };
  });
  if (r.ok) revalidatePath(`/facilities/${fac}`);
  return r;
}

export async function correctStockAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const now = await businessNow();
  const db = await getDb();
  let fac = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const c = await managed(tx, v, String(fd.get('consumableId') ?? ''));
    if (!c) return REFUSED;
    const x = checkCorrection({ kind: fd.get('kind'), quantity: fd.get('quantity'), reason: fd.get('reason') });
    if (!x.ok) return x;
    const lotId = String(fd.get('lotId') ?? '');
    let lot: string | null = null;
    if (lotId) {
      const [l] = isUuid(lotId) ? await tx.select().from(consumableLots).where(and(eq(consumableLots.id, lotId), eq(consumableLots.consumableId, c.id))) : [];
      if (!l) return { ok: false, error: 'Choose a lot of this consumable' };
      lot = l.id;
    }
    fac = c.facilityCode;
    await tx.insert(consumableMoves).values({ consumableId: c.id, lotId: lot, kind: x.value.kind, quantity: x.value.quantity, reason: x.value.reason, byName: v.name, at: now });
    await writeAudit(tx, { ...audit(v, fac, `stock ${x.value.kind === 'discard' ? 'discarded' : 'adjusted'}: ${c.name} ${x.value.quantity > 0 ? '+' : ''}${x.value.quantity} ${c.unit}`, c.id), reason: x.value.reason });
    return { ok: true };
  });
  if (r.ok) revalidatePath(`/facilities/${fac}`);
  return r;
}

export async function setRequirementAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const db = await getDb();
  let fac = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const c = await managed(tx, v, String(fd.get('consumableId') ?? ''));
    if (!c) return REFUSED;
    const code = String(fd.get('testTypeCode') ?? '');
    const [tt] = await tx.select({ code: testTypes.code }).from(testTypes).where(eq(testTypes.code, code));
    if (!tt) return { ok: false, error: 'Choose a test type' };
    const raw = String(fd.get('quantity') ?? '').trim();
    const zero = /^0+([.,]0*)?$/.test(raw);
    const q = zero ? 0 : quantityOf(raw);
    if (q == null) return { ok: false, error: 'Enter a positive quantity (0 removes it)' };
    fac = c.facilityCode;
    const key = and(eq(testTypeConsumables.testTypeCode, code), eq(testTypeConsumables.consumableId, c.id));
    if (q === 0) await tx.delete(testTypeConsumables).where(key);
    else {
      await tx.insert(testTypeConsumables).values({ testTypeCode: code, consumableId: c.id, quantity: q, updatedByName: v.name })
        .onConflictDoUpdate({ target: [testTypeConsumables.testTypeCode, testTypeConsumables.consumableId], set: { quantity: q, updatedByName: v.name, updatedAt: new Date() } });
    }
    await writeAudit(tx, audit(v, fac, q === 0 ? `consumable no longer needed by ${code}: ${c.name}` : `consumable needed by ${code}: ${c.name} ${q} ${c.unit} per test`, c.id));
    return { ok: true };
  });
  if (r.ok) revalidatePath(`/facilities/${fac}`);
  return r;
}
