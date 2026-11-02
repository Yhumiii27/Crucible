import 'server-only';
// REST API of the bench systems (CR-083, X-17): a client is bound to one facility and reads only that facility — its resources,
// its bookings (a confidential project masked, apiBooking) and the events of its resources. Read-only: nothing here writes
// in the planning; the client's last use is the only thing recorded.
import { and, asc, desc, eq, gt, inArray, isNull, lt, max } from 'drizzle-orm';
import { apiBooking, type ApiBooking, API_EVENTS_PAGE } from '@/domain/api';
import { clientAddress } from '@/domain/rate-limit';
import { getDb } from '@/server/db/client';
import { apiClients, apiEvents, bookings, incidents, projects, resources } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import { hitRate } from '@/server/http/rate-limit';
import { bearerOf, hashToken, readToken } from '@/server/http/tokens';

type Q = DB | Tx;

export interface ApiClient {
  id: string;
  facilityCode: string;
  label: string;
}

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } as const;

/** A JSON answer of the API, never cached. */
export const apiJson = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

/** The client of a request (limit of attempts, then its token), or the answer to send instead: 429 or 401. */
export async function apiClientOf(request: Request, now = new Date()): Promise<ApiClient | Response> {
  const rate = await hitRate('api', clientAddress(request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip')), { name: 'API client', userId: null, role: null }, now);
  if (!rate.ok) return apiJson(429, { error: 'Too many requests' }, { 'Retry-After': String(rate.retryAfterSec) });
  const token = readToken(bearerOf(request.headers.get('authorization')), 'cra');
  if (!token) return apiJson(401, { error: 'An API token is required (Authorization: Bearer cra_…)' });
  const db = await getDb();
  const [c] = await db.select({ id: apiClients.id, facilityCode: apiClients.facilityCode, label: apiClients.label, lastSeenAt: apiClients.lastSeenAt })
    .from(apiClients).where(and(eq(apiClients.tokenHash, hashToken(token)), isNull(apiClients.revokedAt)));
  if (!c) return apiJson(401, { error: 'Unknown or revoked token' });
  // The last use, at most once a minute (a client polling every few seconds writes little).
  if (!c.lastSeenAt || now.getTime() - c.lastSeenAt.getTime() > 60_000) {
    await db.transaction(async (tx) => {
      await tx.update(apiClients).set({ lastSeenAt: now }).where(eq(apiClients.id, c.id));
    });
  }
  return { id: c.id, facilityCode: c.facilityCode, label: c.label };
}

/** The facility's resources. */
export async function apiResources(facilityCode: string, q?: Q) {
  const db = q ?? (await getDb());
  const rows = await db.select().from(resources).where(eq(resources.facilityCode, facilityCode)).orderBy(asc(resources.code));
  return rows.map((r) => ({
    code: r.code, name: r.name, kind: r.kind, status: r.status, capacity: r.capacity, granularity: r.granularity,
    setupMinutes: r.setupMinutes, teardownMinutes: r.teardownMinutes, bufferMinutes: r.bufferMinutes, minNoticeHours: r.minNoticeHours, maxDays: r.maxDays,
  }));
}

const bookingColumns = {
  b: bookings, resourceCode: resources.code, facilityCode: resources.facilityCode, keystoneCode: projects.keystoneCode, confidential: projects.confidential,
};

type BookingRow = { b: typeof bookings.$inferSelect; resourceCode: string; facilityCode: string; keystoneCode: string | null; confidential: boolean };

const toApi = (r: BookingRow): ApiBooking => apiBooking({
  ...r.b, resourceCode: r.resourceCode, facilityCode: r.facilityCode, keystoneCode: r.keystoneCode, confidential: r.confidential,
});

/** The facility's bookings overlapping [from, to), every status, imported history included; optionally one resource. */
export async function apiBookings(facilityCode: string, p: { from: number; to: number; resourceCode?: string | null }, q?: Q): Promise<ApiBooking[]> {
  const db = q ?? (await getDb());
  const rows = await db.select(bookingColumns).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(projects, eq(projects.code, bookings.projectCode))
    .where(and(eq(resources.facilityCode, facilityCode), p.resourceCode ? eq(resources.code, p.resourceCode) : undefined, lt(bookings.startsAt, new Date(p.to)), gt(bookings.endsAt, new Date(p.from))))
    .orderBy(asc(bookings.startsAt), asc(bookings.ref));
  return rows.map(toApi);
}

/** One booking of the facility by its reference, or null (another facility's is unknown). */
export async function apiBookingByRef(facilityCode: string, ref: string, q?: Q): Promise<ApiBooking | null> {
  const db = q ?? (await getDb());
  const [row] = await db.select(bookingColumns).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(projects, eq(projects.code, bookings.projectCode))
    .where(and(eq(bookings.ref, ref), eq(resources.facilityCode, facilityCode)));
  return row ? toApi(row) : null;
}

export interface ApiEvent {
  id: number;
  type: string;
  occurredAt: string;
  facility: string;
  resource: string;
  /** The booking as it is now (an event is a signal: read the current state, never replay a stale one). */
  booking?: ApiBooking;
  incident?: { ref: string; kind: string; status: string; label: string; start: string; end: string };
}

/** The facility's events after `after` (sequence number), oldest first, at most `limit`. */
export async function apiEventsAfter(facilityCode: string, after: number, limit = API_EVENTS_PAGE, q?: Q): Promise<ApiEvent[]> {
  const db = q ?? (await getDb());
  const rows = await db.select({ e: apiEvents, resourceCode: resources.code }).from(apiEvents).innerJoin(resources, eq(resources.id, apiEvents.resourceId))
    .where(and(eq(resources.facilityCode, facilityCode), gt(apiEvents.seq, after))).orderBy(asc(apiEvents.seq)).limit(limit);
  if (!rows.length) return [];
  const bookingIds = [...new Set(rows.map((r) => r.e.bookingId).filter((x): x is string => !!x))];
  const incidentIds = [...new Set(rows.map((r) => r.e.incidentId).filter((x): x is string => !!x))];
  const bRows = bookingIds.length
    ? await db.select(bookingColumns).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(projects, eq(projects.code, bookings.projectCode))
      .where(inArray(bookings.id, bookingIds))
    : [];
  const byBooking = new Map(bRows.map((r) => [r.b.id, toApi(r)]));
  const iRows = incidentIds.length ? await db.select().from(incidents).where(inArray(incidents.id, incidentIds)) : [];
  const byIncident = new Map(iRows.map((i) => [i.id, { ref: i.ref, kind: i.kind, status: i.status, label: i.label, start: i.startsAt.toISOString(), end: i.endsAt.toISOString() }]));
  return rows.map((r) => ({
    id: r.e.seq,
    type: r.e.kind,
    occurredAt: r.e.occurredAt.toISOString(),
    facility: facilityCode,
    resource: r.resourceCode,
    ...(r.e.bookingId ? { booking: byBooking.get(r.e.bookingId) } : {}),
    ...(r.e.incidentId ? { incident: byIncident.get(r.e.incidentId) } : {}),
  }));
}

/** The last event's sequence number (0 without any): a new client starts there, without the backlog. */
export async function lastEventSeq(q: Q): Promise<number> {
  const [r] = await q.select({ m: max(apiEvents.seq) }).from(apiEvents);
  return Number(r?.m ?? 0);
}

/** The facility's API clients (the facility tab): never the token nor the signing secret. */
export async function facilityApiClients(facilityCode: string, q?: Q) {
  const db = q ?? (await getDb());
  const rows = await db.select().from(apiClients).where(eq(apiClients.facilityCode, facilityCode)).orderBy(desc(apiClients.createdAt));
  return rows.map((c) => ({
    id: c.id, label: c.label, webhookUrl: c.webhookUrl, createdByName: c.createdByName, createdAt: c.createdAt.toISOString(),
    lastSeenAt: c.lastSeenAt?.toISOString() ?? null, lastDeliveryAt: c.lastDeliveryAt?.toISOString() ?? null, lastError: c.lastError,
    failures: c.failures, revoked: !!c.revokedAt,
  }));
}
