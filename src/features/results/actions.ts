'use server';
// Server Functions of the test results (CR-081, X-18): who runs the facility (and sees what the booking is for) or who manages
// the project records the result of a test started or done; a correction is a new version with its reason (append-only). The
// requester is notified. Audited.
import { desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { RESULT_OUTCOME_LABEL, canHaveResult, checkResult } from '@/domain/results';
import { canManageNeeds, canSeeBookingDetail, operatedFacilities } from '@/domain/rights';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { bookings, projects, resources, testResults } from '@/server/db/schema';
import { notify } from '@/server/notify';
import { getViewer } from '@/server/session';

export type ActionResult = { ok: true } | { ok: false; error: string };

const REFUSED: ActionResult = { ok: false, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function recordResultAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = String(fd.get('bookingId') ?? '');
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const db = await getDb();
  let projectCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select({ b: bookings, facilityCode: resources.facilityCode, p: projects }).from(bookings)
      .innerJoin(resources, eq(resources.id, bookings.resourceId)).innerJoin(projects, eq(projects.code, bookings.projectCode)).where(eq(bookings.id, id));
    if (!row) return REFUSED;
    const runs = operatedFacilities(v.role, v.assignments).includes(row.facilityCode)
      && canSeeBookingDetail(v.role, v.assignments, row.facilityCode, { code: row.p.code, entityCode: row.p.entityCode, confidential: row.p.confidential });
    if (!runs && !canManageNeeds(v.role, v.assignments, row.p)) return REFUSED;
    if (!canHaveResult(row.b.status)) return { ok: false, error: 'A result is recorded once the test has started' };
    const [last] = await tx.select({ version: testResults.version }).from(testResults).where(eq(testResults.bookingId, id)).orderBy(desc(testResults.version)).limit(1);
    const c = checkResult({
      outcome: fd.get('outcome'), measurements: fd.get('measurements'), observations: fd.get('observations'), rawDataRef: fd.get('rawDataRef'),
      notebookRef: fd.get('notebookRef'), elnUrl: fd.get('elnUrl'), reason: fd.get('reason'),
    }, !!last);
    if (!c.ok) return c;
    const version = (last?.version ?? 0) + 1;
    const now = new Date();
    const [res] = await tx.insert(testResults).values({ bookingId: id, version, ...c.value, recordedByUserId: v.userId, recordedByName: v.name, recordedAt: now }).returning({ id: testResults.id });
    projectCode = row.b.projectCode;
    await writeAudit(tx, {
      actorName: v.name, actorUserId: v.userId, actorRole: v.role, area: 'Bookings', objectRef: `Booking ${row.b.ref}`,
      change: `test result ${version > 1 ? `corrected (version ${version})` : 'recorded'}: ${RESULT_OUTCOME_LABEL[c.value.outcome]}, ${c.value.measurements.length} measurements`,
      entityType: 'test_result', entityId: res.id, projectCode, reason: c.value.reason ?? undefined,
    });
    await notify(tx, [row.b.requestedByUserId], { kind: 'test_result', title: `Result of your test · ${row.b.ref}`, href: `/projects/${encodeURIComponent(projectCode)}` }, { except: v.userId, at: now });
    return { ok: true };
  });
  if (r.ok) for (const p of [`/projects/${projectCode}`, '/my/schedule']) revalidatePath(p);
  return r;
}
