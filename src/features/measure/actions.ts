'use server';
// Server Functions of the measured occupancy (CR-071, X-8) and of the calendar subscriptions (CR-072, X-9).
// - Devices: a facility manager (or the coordinator) of the facility adds a device to one of its resources — its token is shown
//   once, kept as a hash — or revokes it. Audited.
// - Kiosk: the start and stop buttons of the kiosk page; the token of the page is the only credential (no session), checked
//   against the stored hash; it acts on its own resource only.
// - Calendar subscriptions: any business profile subscribes Outlook to their tests, or to a resource they see; the address is
//   shown once, kept as a hash; revoked by its owner. The feed applies the owner's rights at every read.
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { canSee } from '@/config/screens';
import { checkDevice, DEVICE_KIND_LABEL, type DeviceKind } from '@/domain/occupancy';
import { managedFacilities } from '@/domain/rights';
import { businessNow } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { calendarFeeds, occupancyDevices, resources } from '@/server/db/schema';
import { visibleFacilities } from '@/server/dal/visibility';
import { hashToken, newToken, readToken } from '@/server/http/tokens';
import { recordOccupancyEvent } from '@/server/occupancy';
import { getViewer } from '@/server/session';

export type ActionResult = { ok: true; warnings?: string[] } | { ok: false; error: string };
/** A creation that hands back a secret shown once: `path` is relative to Crucible's address. */
export type SecretResult = { ok: true; path: string; secret: string } | { ok: false; error: string };

const REFUSED = { ok: false as const, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function createDeviceAction(_prev: SecretResult | null, fd: FormData): Promise<SecretResult> {
  const v = await getViewer();
  const mine = managedFacilities(v.role, v.assignments);
  if (!mine.length) return REFUSED;
  const facilityCode = String(fd.get('facilityCode') ?? '');
  if (!mine.includes(facilityCode)) return REFUSED;
  const token = newToken('crd');
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<SecretResult> => {
    const res = await tx.select({ id: resources.id, code: resources.code }).from(resources).where(eq(resources.facilityCode, facilityCode));
    const c = checkDevice({ resourceId: fd.get('resourceId'), kind: fd.get('kind'), label: fd.get('label') }, { resourceIds: new Set(res.map((x) => x.id)) });
    if (!c.ok) return c;
    const [row] = await tx.insert(occupancyDevices).values({ ...c.value, tokenHash: hashToken(token), createdByName: v.name }).returning({ id: occupancyDevices.id });
    const code = res.find((x) => x.id === c.value.resourceId)!.code;
    await writeAudit(tx, {
      actorName: v.name, actorUserId: v.userId, actorRole: v.role, area: 'Facilities', objectRef: `Resource ${code}`,
      change: `occupancy device added: ${DEVICE_KIND_LABEL[c.value.kind as DeviceKind]} · ${c.value.label}`, entityType: 'occupancy_device', entityId: row.id,
    });
    return { ok: true, path: `/kiosk/${token}`, secret: token };
  });
  if (r.ok) revalidatePath(`/facilities/${facilityCode}`);
  return r;
}

export async function revokeDeviceAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select({ d: occupancyDevices, code: resources.code, facilityCode: resources.facilityCode }).from(occupancyDevices)
      .innerJoin(resources, eq(resources.id, occupancyDevices.resourceId)).where(eq(occupancyDevices.id, id));
    if (!row || !managedFacilities(v.role, v.assignments).includes(row.facilityCode)) return REFUSED;
    facilityCode = row.facilityCode;
    if (row.d.revokedAt) return { ok: true };
    await tx.update(occupancyDevices).set({ revokedAt: new Date(), revokedByName: v.name }).where(eq(occupancyDevices.id, id));
    await writeAudit(tx, { actorName: v.name, actorUserId: v.userId, actorRole: v.role, area: 'Facilities', objectRef: `Resource ${row.code}`, change: `occupancy device revoked: ${row.d.label}`, entityType: 'occupancy_device', entityId: id });
    return { ok: true };
  });
  if (r.ok && facilityCode) revalidatePath(`/facilities/${facilityCode}`);
  return r;
}

/** The kiosk's buttons: the token of the page is the credential. */
export async function kioskEventAction(rawToken: string, kind: 'start' | 'stop'): Promise<ActionResult> {
  const token = readToken(rawToken, 'crd');
  if (!token || (kind !== 'start' && kind !== 'stop')) return { ok: false, error: 'Unknown or revoked device' };
  const r = await recordOccupancyEvent(token, { kind }, await businessNow());
  if (!r.ok) return { ok: false, error: r.status === 401 ? 'Unknown or revoked device' : r.error };
  revalidatePath(`/kiosk/${token}`);
  if (r.outcome === 'ignored') return { ok: false, error: r.reason ?? 'Ignored' };
  return { ok: true };
}

export async function createCalendarFeedAction(_prev: SecretResult | null, fd: FormData): Promise<SecretResult> {
  const v = await getViewer();
  if (!canSee(v.role, 'notifications')) return REFUSED;
  const scope = String(fd.get('scope') ?? '');
  const resourceId = String(fd.get('resourceId') ?? '');
  if (scope !== 'mine' && scope !== 'resource') return { ok: false, error: 'Choose what the calendar shows' };
  const db = await getDb();
  if (scope === 'resource') {
    if (!isUuid(resourceId)) return { ok: false, error: 'Choose a resource' };
    const codes = (await visibleFacilities(v)).map((f) => f.code);
    const [res] = await db.select({ facilityCode: resources.facilityCode }).from(resources).where(eq(resources.id, resourceId));
    if (!res || !codes.includes(res.facilityCode)) return { ok: false, error: 'Choose a resource' };
  }
  const token = newToken('crc');
  await db.transaction(async (tx) => {
    await tx.insert(calendarFeeds).values({ userId: v.userId, role: v.role, scope, resourceId: scope === 'resource' ? resourceId : null, tokenHash: hashToken(token) });
  });
  revalidatePath('/notifications');
  return { ok: true, path: `/api/calendar/${token}.ics`, secret: token };
}

export async function revokeCalendarFeedAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select().from(calendarFeeds).where(and(eq(calendarFeeds.id, id), eq(calendarFeeds.userId, v.userId), isNull(calendarFeeds.revokedAt)));
    if (!row) return REFUSED;
    await tx.update(calendarFeeds).set({ revokedAt: new Date() }).where(eq(calendarFeeds.id, id));
    return { ok: true };
  });
  if (r.ok) revalidatePath('/notifications');
  return r;
}
