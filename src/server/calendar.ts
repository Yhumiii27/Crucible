import 'server-only';
// Bookings in Outlook and Teams (CR-072, X-9). Both apply the rights of the person, read again each time (U-3: a project the
// person may not see is "Booked (confidential)" or "Booked · <entity>", never named):
// - the subscription feeds (GET /api/calendar/<token>.ics): "my tests" (requested by me, or on the facilities I run) or one
//   resource I see, from 30 days back to 6 months ahead;
// - the invitation attached to the e-mail of a confirmed, moved or cancelled booking (METHOD:REQUEST / CANCEL).
// Texts are French, the default language; what people typed is shown as typed.
import { and, asc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { isRoleKey, type RoleKey } from '@/config/roles';
import { icsCalendar, icsStatusOf, sequenceOf, type IcsEvent } from '@/domain/ics';
import { BOOKING_STATUS_LABEL } from '@/domain/resources';
import { canSeeBookingDetail, operatedFacilities } from '@/domain/rights';
import { makeT } from '@/i18n/translate';
import { getDb } from '@/server/db/client';
import { bookings, calendarFeeds, projects, resources } from '@/server/db/schema';
import type { DB } from '@/server/db/types';
import { getUserAccount, viewerOfAccount } from '@/server/dal/users';
import { visibleFacilities } from '@/server/dal/visibility';
import { hashToken } from '@/server/http/tokens';
import type { Viewer } from '@/server/viewer';

const DAY = 86_400_000;
const t = makeT('fr');

type BookingRow = {
  b: typeof bookings.$inferSelect;
  resourceCode: string;
  resourceName: string;
  facilityCode: string;
  projectName: string;
  confidential: boolean;
};

const columns = {
  b: bookings, resourceCode: resources.code, resourceName: resources.name, facilityCode: resources.facilityCode, projectName: projects.name, confidential: projects.confidential,
};

/** The calendar event of a booking, as `viewer` may see it. */
export function bookingEvent(r: BookingRow, viewer: Viewer, baseUrl: string): IcsEvent {
  const open = canSeeBookingDetail(viewer.role, viewer.assignments, r.facilityCode, { code: r.b.projectCode, entityCode: r.b.entityCode, confidential: r.confidential });
  const what = open ? `${r.b.projectCode} · ${r.b.title}` : r.confidential ? t('Booked (confidential)') : `${t('Booked')} · ${r.b.entityCode}`;
  const lines = [`${t('Booking reference')} : ${r.b.ref}`, `${t('Status')} : ${t(BOOKING_STATUS_LABEL[r.b.status] ?? r.b.status)}`];
  if (open && r.b.operators) lines.push(`${t('Operators')} : ${r.b.operators}`);
  return {
    uid: `${r.b.id}@crucible.epc2i`,
    sequence: sequenceOf(r.b.updatedAt.getTime()),
    start: r.b.startsAt.getTime(),
    end: r.b.endsAt.getTime(),
    summary: `${r.resourceCode} · ${what}`,
    location: `${r.facilityCode} · ${r.resourceName}`,
    description: lines.join('\n'),
    status: icsStatusOf(r.b.status),
    url: open && baseUrl ? `${baseUrl}/projects/${encodeURIComponent(r.b.projectCode)}` : undefined,
  };
}

/** The viewer of an account in a role it still holds (else its first role); null when the account is inactive or has none. */
async function viewerOf(userId: string, role: string, today: string, q: DB): Promise<Viewer | null> {
  const a = await getUserAccount(userId, today, q);
  if (!a || !a.active || !a.roles.length) return null;
  const r: RoleKey = isRoleKey(role) && a.roles.includes(role) ? role : a.roles[0];
  return viewerOfAccount(a, r, false);
}

/** The feed of a subscription token: the .ics text, or null (unknown or revoked token, inactive account). */
export async function calendarFeed(token: string, now: Date, today: string, baseUrl: string): Promise<string | null> {
  const db = await getDb();
  const [feed] = await db.select().from(calendarFeeds).where(and(eq(calendarFeeds.tokenHash, hashToken(token)), isNull(calendarFeeds.revokedAt)));
  if (!feed) return null;
  const viewer = await viewerOf(feed.userId, feed.role, today, db);
  if (!viewer) return null;
  const visible = (await visibleFacilities(viewer)).map((f) => f.code);
  const from = new Date(now.getTime() - 30 * DAY);
  const to = new Date(now.getTime() + 183 * DAY);
  const live = and(inArray(bookings.status, ['requested', 'confirmed', 'in_progress', 'done']), lt(bookings.startsAt, to), gte(bookings.endsAt, from));
  let rows: BookingRow[] = [];
  let name = '';
  if (feed.scope === 'resource' && feed.resourceId) {
    const [res] = await db.select().from(resources).where(eq(resources.id, feed.resourceId));
    if (!res || !visible.includes(res.facilityCode)) return null;
    name = `Crucible · ${res.code}`;
    rows = await db.select(columns).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(projects, eq(projects.code, bookings.projectCode))
      .where(and(eq(bookings.resourceId, res.id), live)).orderBy(asc(bookings.startsAt));
  } else {
    name = `Crucible · ${t('My tests')}`;
    const run = operatedFacilities(viewer.role, viewer.assignments).filter((c) => visible.includes(c));
    rows = visible.length
      ? await db.select(columns).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(projects, eq(projects.code, bookings.projectCode))
        .where(and(live, inArray(resources.facilityCode, visible), or(eq(bookings.requestedByUserId, viewer.userId), run.length ? inArray(resources.facilityCode, run) : undefined)))
        .orderBy(asc(bookings.startsAt))
      : [];
  }
  await db.transaction(async (tx) => {
    await tx.update(calendarFeeds).set({ lastReadAt: now }).where(eq(calendarFeeds.id, feed.id));
  });
  return icsCalendar({ name, events: rows.map((r) => bookingEvent(r, viewer, baseUrl)), now: now.getTime() });
}

/** The invitation of a booking for one recipient: REQUEST while it holds, CANCEL once cancelled; null when it cannot be read. */
export async function bookingInvitation(db: DB, bookingId: string, recipient: { userId: string; email: string; name: string }, opts: { from: string; baseUrl: string; now: Date; today: string }) {
  const [row] = await db.select(columns).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(projects, eq(projects.code, bookings.projectCode))
    .where(eq(bookings.id, bookingId));
  if (!row) return null;
  const viewer = await viewerOf(recipient.userId, '', opts.today, db);
  if (!viewer) return null;
  const event = bookingEvent(row, viewer, opts.baseUrl);
  const method = event.status === 'CANCELLED' ? 'CANCEL' : 'REQUEST';
  return {
    method,
    ics: icsCalendar({ method, organizer: opts.from, attendee: { email: recipient.email, name: recipient.name }, events: [event], now: opts.now.getTime() }),
  } as const;
}

/** The person's subscriptions (the /notifications page). */
export async function myCalendarFeeds(userId: string) {
  const db = await getDb();
  const rows = await db.select({ f: calendarFeeds, resourceCode: resources.code }).from(calendarFeeds).leftJoin(resources, eq(resources.id, calendarFeeds.resourceId))
    .where(and(eq(calendarFeeds.userId, userId), isNull(calendarFeeds.revokedAt))).orderBy(asc(calendarFeeds.createdAt));
  return rows.map((r) => ({ id: r.f.id, scope: r.f.scope, resourceCode: r.resourceCode, createdAt: r.f.createdAt, lastReadAt: r.f.lastReadAt }));
}
