import 'server-only';
// Forms of the bookings (CR-075): the active templates of facilities and the forms filled for bookings — for "My schedule" (fill
// them) and the facility's "Forms" tab (keep the templates, read the last forms filled). Called after the page applied the
// viewer's visibility.
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type { FormStage } from '@/domain/booking-forms';
import { getDb } from '@/server/db/client';
import { bookings, formResponses, formTemplates, resources } from '@/server/db/schema';

/** Active templates by facility and stage, and the stages filled per booking. */
export async function bookingForms(bookingIds: readonly string[], facilityCodes: readonly string[]) {
  const db = await getDb();
  const [tpls, resp] = await Promise.all([
    facilityCodes.length ? db.select().from(formTemplates).where(and(inArray(formTemplates.facilityCode, [...facilityCodes]), eq(formTemplates.active, true))) : [],
    bookingIds.length ? db.select({ bookingId: formResponses.bookingId, stage: formResponses.stage }).from(formResponses).where(inArray(formResponses.bookingId, [...bookingIds])) : [],
  ]);
  return {
    template: (facilityCode: string, stage: FormStage) => tpls.find((t) => t.facilityCode === facilityCode && t.stage === stage) ?? null,
    filled: (bookingId: string, stage: FormStage) => resp.filter((r) => r.bookingId === bookingId && r.stage === stage).length,
  };
}

/** The facility's templates (active or not) and the forms filled over the last 30 days. */
export async function facilityForms(facilityCode: string, since: Date) {
  const db = await getDb();
  const [templates, filled] = await Promise.all([
    db.select().from(formTemplates).where(eq(formTemplates.facilityCode, facilityCode)),
    db.select({ r: formResponses, ref: bookings.ref, resourceCode: resources.code }).from(formResponses)
      .innerJoin(bookings, eq(bookings.id, formResponses.bookingId)).innerJoin(resources, eq(resources.id, bookings.resourceId))
      .where(and(eq(resources.facilityCode, facilityCode), gte(formResponses.createdAt, since))).orderBy(desc(formResponses.createdAt)).limit(100),
  ]);
  return { templates, filled: filled.map(({ r, ref, resourceCode }) => ({ ...r, ref, resourceCode })) };
}
