import 'server-only';
// Test results (CR-081): the latest version per booking, with how many versions it has, and the whole history of one booking.
// Called after the page applied the viewer's visibility (project sheet, My schedule).
import { asc, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { testResults } from '@/server/db/schema';

export type TestResultRow = typeof testResults.$inferSelect;

export interface BookingResult {
  latest: TestResultRow;
  /** Every version, oldest first. */
  versions: TestResultRow[];
}

/** The results of the bookings given, by booking id. */
export async function bookingResults(bookingIds: readonly string[]): Promise<Map<string, BookingResult>> {
  const out = new Map<string, BookingResult>();
  if (!bookingIds.length) return out;
  const db = await getDb();
  const rows = await db.select().from(testResults).where(inArray(testResults.bookingId, [...bookingIds])).orderBy(asc(testResults.bookingId), asc(testResults.version));
  for (const r of rows) {
    const cur = out.get(r.bookingId);
    if (cur) {
      cur.versions.push(r);
      cur.latest = r;
    } else out.set(r.bookingId, { latest: r, versions: [r] });
  }
  return out;
}
