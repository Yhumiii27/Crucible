import 'server-only';
// Measured occupancy (CR-071, X-8): an event of a device (kiosk, bench PC agent, interlock, badge reader) is matched to the
// bookings of its resource by the pure rules of src/domain/occupancy.ts, inside one transaction behind the write lock: the
// booking is started or ended (actual times = the instant of the event), the event is kept (append-only) and the booking's
// change is audited in the device's name. Reads for the kiosk and the facility sheet.
import { and, asc, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { canTransition } from '@/domain/booking';
import { eventInstant, reconcile, unbookedUses, type OccupancyEventKind, type OccupancyOutcome } from '@/domain/occupancy';
import { canSeeBookingDetail } from '@/domain/rights';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { bookings, occupancyDevices, occupancyEvents, projects, resources } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import { hashToken } from '@/server/http/tokens';
import type { Viewer } from '@/server/viewer';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export interface DeviceRow {
  id: string;
  resourceId: string;
  resourceCode: string;
  resourceName: string;
  facilityCode: string;
  kind: string;
  label: string;
}

/** The active device of a token, or null. */
export async function deviceOfToken(token: string, q?: DB | Tx): Promise<DeviceRow | null> {
  const db = q ?? (await getDb());
  const [row] = await db
    .select({ id: occupancyDevices.id, resourceId: occupancyDevices.resourceId, resourceCode: resources.code, resourceName: resources.name, facilityCode: resources.facilityCode, kind: occupancyDevices.kind, label: occupancyDevices.label })
    .from(occupancyDevices).innerJoin(resources, eq(resources.id, occupancyDevices.resourceId))
    .where(and(eq(occupancyDevices.tokenHash, hashToken(token)), isNull(occupancyDevices.revokedAt)));
  return row ?? null;
}

export type RecordResult =
  | { ok: true; outcome: OccupancyOutcome; bookingRef: string | null; reason: string | null; at: string }
  | { ok: false; status: 400 | 401; error: string };

/** True when the last use without a booking on the resource (since `since`) is still open. */
async function unbookedOpenOn(tx: Tx, resourceId: string, since: Date): Promise<boolean> {
  const [last] = await tx.select({ outcome: occupancyEvents.outcome }).from(occupancyEvents)
    .where(and(eq(occupancyEvents.resourceId, resourceId), inArray(occupancyEvents.outcome, ['unbooked_start', 'unbooked_stop']), gte(occupancyEvents.occurredAt, since)))
    .orderBy(desc(occupancyEvents.occurredAt), desc(occupancyEvents.receivedAt)).limit(1);
  return last?.outcome === 'unbooked_start';
}

/** Records one event of the device of `token` and applies it to the bookings of its resource. */
export async function recordOccupancyEvent(token: string, input: { kind: unknown; at?: unknown }, now: Date): Promise<RecordResult> {
  const kind = input.kind === 'start' || input.kind === 'stop' ? (input.kind as OccupancyEventKind) : null;
  if (!kind) return { ok: false, status: 400, error: 'kind must be "start" or "stop"' };
  const when = eventInstant(input.at, now.getTime());
  if (!when.ok) return { ok: false, status: 400, error: when.error };
  const at = new Date(when.at);
  const db = await getDb();
  return db.transaction(async (tx): Promise<RecordResult> => {
    const device = await deviceOfToken(token, tx);
    if (!device) return { ok: false, status: 401, error: 'Unknown or revoked device' };
    const slots = await tx.select().from(bookings)
      .where(and(eq(bookings.resourceId, device.resourceId), inArray(bookings.status, ['confirmed', 'in_progress']), lt(bookings.startsAt, new Date(at.getTime() + DAY)), gte(bookings.endsAt, new Date(at.getTime() - 7 * DAY))));
    const decision = reconcile({ kind, at: at.getTime() }, slots.map((b) => ({
      id: b.id, status: b.status, start: b.startsAt.getTime(), end: b.endsAt.getTime(), setupMinutes: b.setupMinutes, actualStart: b.actualStartAt?.getTime() ?? null,
    })), await unbookedOpenOn(tx, device.resourceId, new Date(at.getTime() - 7 * DAY)));
    const booking = 'bookingId' in decision ? slots.find((b) => b.id === decision.bookingId)! : null;
    const actor = { actorName: `${device.label} (${device.kind})`, actorUserId: null, actorRole: null, area: 'Bookings', entityType: 'booking' };
    if (decision.kind === 'started' && booking && canTransition(booking.status, 'in_progress')) {
      await tx.update(bookings).set({ status: 'in_progress', actualStartAt: at, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      await writeAudit(tx, { ...actor, objectRef: `Booking ${booking.ref}`, change: 'status: confirmed → in_progress (measured)', entityId: booking.id, projectCode: booking.projectCode });
    }
    if (decision.kind === 'ended' && booking && canTransition(booking.status, 'done')) {
      await tx.update(bookings).set({ status: 'done', actualStartAt: booking.actualStartAt ?? at, actualEndAt: at, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      await writeAudit(tx, { ...actor, objectRef: `Booking ${booking.ref}`, change: `status: ${booking.status} → done (measured)`, entityId: booking.id, projectCode: booking.projectCode });
    }
    const reason = decision.kind === 'ignored' ? decision.reason : null;
    await tx.insert(occupancyEvents).values({ deviceId: device.id, resourceId: device.resourceId, kind, occurredAt: at, receivedAt: now, outcome: decision.kind, bookingId: booking?.id ?? null, note: reason });
    await tx.update(occupancyDevices).set({ lastSeenAt: now }).where(eq(occupancyDevices.id, device.id));
    return { ok: true, outcome: decision.kind, bookingRef: booking?.ref ?? null, reason, at: at.toISOString() };
  });
}

/** What the kiosk shows: its resource, the running test and the next ones of the day (confidential projects masked). */
export async function kioskView(device: DeviceRow, now: Date) {
  const db = await getDb();
  const rows = await db.select({ b: bookings, confidential: projects.confidential, projectName: projects.name }).from(bookings)
    .innerJoin(projects, eq(projects.code, bookings.projectCode))
    .where(and(eq(bookings.resourceId, device.resourceId), inArray(bookings.status, ['confirmed', 'in_progress']), gte(bookings.endsAt, new Date(now.getTime() - DAY)), lt(bookings.startsAt, new Date(now.getTime() + DAY))))
    .orderBy(asc(bookings.startsAt));
  const shown = rows.map((r) => ({
    ref: r.b.ref, status: r.b.status, start: r.b.startsAt.getTime(), end: r.b.endsAt.getTime(),
    // A kiosk is seen by anyone in front of the resource: a confidential project is never named (U-3).
    label: r.confidential ? null : `${r.b.projectCode} · ${r.b.title}`,
  }));
  const [last] = await db.select({ outcome: occupancyEvents.outcome }).from(occupancyEvents)
    .where(and(eq(occupancyEvents.resourceId, device.resourceId), inArray(occupancyEvents.outcome, ['unbooked_start', 'unbooked_stop'])))
    .orderBy(desc(occupancyEvents.occurredAt)).limit(1);
  return {
    running: shown.find((b) => b.status === 'in_progress') ?? null,
    next: shown.filter((b) => b.status === 'confirmed' && b.end > now.getTime()).slice(0, 4),
    unbookedOpen: last?.outcome === 'unbooked_start',
  };
}

/** The devices of a facility and their last 30 days: events, uses without a booking (facility sheet, "Measurement" tab). */
export async function facilityMeasurement(viewer: Viewer, facilityCode: string, now: Date) {
  const db = await getDb();
  const devices = await db
    .select({ d: occupancyDevices, resourceCode: resources.code })
    .from(occupancyDevices).innerJoin(resources, eq(resources.id, occupancyDevices.resourceId))
    .where(eq(resources.facilityCode, facilityCode)).orderBy(asc(resources.code), asc(occupancyDevices.label));
  const since = new Date(now.getTime() - 30 * DAY);
  const events = devices.length
    ? await db.select({ e: occupancyEvents, ref: bookings.ref, projectCode: bookings.projectCode, entityCode: bookings.entityCode, confidential: projects.confidential })
      .from(occupancyEvents)
      .leftJoin(bookings, eq(bookings.id, occupancyEvents.bookingId))
      .leftJoin(projects, eq(projects.code, bookings.projectCode))
      .where(and(inArray(occupancyEvents.deviceId, devices.map((x) => x.d.id)), gte(occupancyEvents.occurredAt, since)))
      .orderBy(desc(occupancyEvents.occurredAt)).limit(200)
    : [];
  const labelOf = new Map(devices.map((x) => [x.d.id, x.d.label]));
  const codeOf = new Map(devices.map((x) => [x.d.resourceId, x.resourceCode]));
  const byResource = new Map<string, { outcome: string; at: number; deviceLabel: string }[]>();
  for (const { e } of events) byResource.set(e.resourceId, [...(byResource.get(e.resourceId) ?? []), { outcome: e.outcome, at: e.occurredAt.getTime(), deviceLabel: labelOf.get(e.deviceId) ?? '' }]);
  return {
    devices: devices.map((x) => ({ id: x.d.id, resourceCode: x.resourceCode, kind: x.d.kind, label: x.d.label, createdAt: x.d.createdAt.getTime(), lastSeenAt: x.d.lastSeenAt?.getTime() ?? null, revoked: !!x.d.revokedAt })),
    events: events.map(({ e, ref, projectCode, entityCode, confidential }) => ({
      id: e.id, resourceCode: codeOf.get(e.resourceId) ?? '', device: labelOf.get(e.deviceId) ?? '', kind: e.kind, at: e.occurredAt.getTime(), outcome: e.outcome, note: e.note,
      // The booking reference is shown; what it is for only to those who may see it (U-3).
      bookingRef: ref, project: ref && projectCode && entityCode && canSeeBookingDetail(viewer.role, viewer.assignments, facilityCode, { code: projectCode, entityCode, confidential: !!confidential }) ? projectCode : null,
    })),
    unbooked: [...byResource.entries()].flatMap(([resourceId, list]) => unbookedUses(list).map((u) => ({ ...u, resourceCode: codeOf.get(resourceId) ?? '' })))
      .sort((a, b) => b.from - a.from),
  };
}
