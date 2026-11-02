'use server';
// Server Functions of the chargeback rates (CR-074, X-19): a facility's managers (coordinator, facility manager) add a dated rate
// to one of its resources, for every entity or one; a newer first day takes over. A rate entered by mistake is withdrawn (kept).
// Audited.
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { checkRate, euros } from '@/domain/charges';
import { managedFacilities } from '@/domain/rights';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { chargeRates, entities, resources } from '@/server/db/schema';
import { getViewer } from '@/server/session';

export type ActionResult = { ok: true } | { ok: false; error: string };

const REFUSED: ActionResult = { ok: false, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function addRateAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const resourceId = String(fd.get('resourceId') ?? '');
  if (!isUuid(resourceId)) return { ok: false, error: 'Choose a resource' };
  const v = await getViewer();
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [res] = await tx.select().from(resources).where(eq(resources.id, resourceId));
    if (!res || !managedFacilities(v.role, v.assignments).includes(res.facilityCode)) return REFUSED;
    const ents = new Set((await tx.select({ code: entities.code }).from(entities)).map((e) => e.code));
    const c = checkRate({ eurPerHour: fd.get('eurPerHour'), validFrom: fd.get('validFrom'), entityCode: fd.get('entityCode') }, ents);
    if (!c.ok) return c;
    facilityCode = res.facilityCode;
    const [row] = await tx.insert(chargeRates).values({ resourceId, ...c.value, createdByName: v.name }).returning({ id: chargeRates.id });
    await writeAudit(tx, {
      actorName: v.name, actorUserId: v.userId, actorRole: v.role, area: 'Facilities', objectRef: `Resource ${res.code}`,
      change: `rate: ${euros(c.value.centsPerHour)} €/h from ${c.value.validFrom}${c.value.entityCode ? ` for ${c.value.entityCode}` : ''}`, entityType: 'charge_rate', entityId: row.id,
    });
    return { ok: true };
  });
  if (r.ok) revalidatePath(`/facilities/${facilityCode}`);
  return r;
}

export async function withdrawRateAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select({ r: chargeRates, code: resources.code, facilityCode: resources.facilityCode }).from(chargeRates)
      .innerJoin(resources, eq(resources.id, chargeRates.resourceId)).where(and(eq(chargeRates.id, id), isNull(chargeRates.withdrawnAt)));
    if (!row || !managedFacilities(v.role, v.assignments).includes(row.facilityCode)) return REFUSED;
    facilityCode = row.facilityCode;
    await tx.update(chargeRates).set({ withdrawnAt: new Date(), withdrawnByName: v.name }).where(eq(chargeRates.id, id));
    await writeAudit(tx, {
      actorName: v.name, actorUserId: v.userId, actorRole: v.role, area: 'Facilities', objectRef: `Resource ${row.code}`,
      change: `rate withdrawn: ${euros(row.r.centsPerHour)} €/h from ${row.r.validFrom}${row.r.entityCode ? ` for ${row.r.entityCode}` : ''}`, entityType: 'charge_rate', entityId: id,
    });
    return { ok: true };
  });
  if (r.ok) revalidatePath(`/facilities/${facilityCode}`);
  return r;
}
