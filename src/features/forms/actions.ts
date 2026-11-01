'use server';
// Forms of the bookings (CR-075, X-14). The facility's coordinator or manager keeps one template per stage (a change raises its
// version, audited); the people who run the facility's tests (operatedFacilities, as for starting a test) fill them for a
// booking: the safety checklist once before the start, the test sheet once from the start, incident reports while it runs (the
// facility's managers are told). Every check is done again server-side inside the transaction; a filled form is append-only.
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { checkAnswers, FORM_STAGE_LABEL, FORM_STAGES, parseItems, stagesOpen, type FormStage } from '@/domain/booking-forms';
import { managedFacilities, operatedFacilities } from '@/domain/rights';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { bookings, facilities, formResponses, formTemplates, resources } from '@/server/db/schema';
import { notify, usersWithRole } from '@/server/notify';
import { getViewer, type Viewer } from '@/server/session';

export type ActionResult = { ok: true } | { ok: false; error: string };

const REFUSED: ActionResult = { ok: false, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isStage = (v: string): v is FormStage => (FORM_STAGES as readonly string[]).includes(v);
const fieldsOf = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
const audit = (v: Viewer, objectRef: string, change: string, extra: { entityType: string; entityId?: string; projectCode?: string; after?: Record<string, unknown> }) => ({
  actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef, change, area: 'Facilities', ...extra,
});

/** A template of the facility for a stage: created, or changed (version + 1), or switched off. */
export async function saveFormTemplateAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const facilityCode = String(fd.get('facilityCode') ?? '');
  const stage = String(fd.get('stage') ?? '');
  if (!isStage(stage) || !managedFacilities(v.role, v.assignments).includes(facilityCode)) return REFUSED;
  const items = parseItems(String(fd.get('items') ?? ''));
  if (!items.ok) return items;
  const active = fd.get('active') === 'on';
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [f] = await tx.select({ code: facilities.code }).from(facilities).where(eq(facilities.code, facilityCode));
    if (!f) return REFUSED;
    const [before] = await tx.select().from(formTemplates).where(and(eq(formTemplates.facilityCode, facilityCode), eq(formTemplates.stage, stage)));
    const version = before ? before.version + 1 : 1;
    if (before) await tx.update(formTemplates).set({ items: items.value, version, active, updatedByName: v.name, updatedAt: new Date() }).where(eq(formTemplates.id, before.id));
    else await tx.insert(formTemplates).values({ facilityCode, stage, items: items.value, active, updatedByName: v.name });
    await writeAudit(tx, audit(v, `Facility ${facilityCode}`, `${FORM_STAGE_LABEL[stage]}: version ${version}${active ? '' : ' (off)'} · ${items.value.length} items`, {
      entityType: 'form_template', after: { stage, version, active, items: items.value },
    }));
    return { ok: true };
  });
  if (r.ok) revalidatePath(`/facilities/${facilityCode}`);
  return r;
}

/** A form filled for a booking. */
export async function fillFormAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const bookingId = String(fd.get('bookingId') ?? '');
  const stage = String(fd.get('stage') ?? '');
  if (!isUuid(bookingId) || !isStage(stage)) return REFUSED;
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select({ b: bookings, code: resources.code, facilityCode: resources.facilityCode }).from(bookings)
      .innerJoin(resources, eq(resources.id, bookings.resourceId)).where(eq(bookings.id, bookingId));
    if (!row || !operatedFacilities(v.role, v.assignments).includes(row.facilityCode)) return REFUSED;
    facilityCode = row.facilityCode;
    if (!stagesOpen(row.b.status).includes(stage)) return { ok: false, error: 'This form cannot be filled at this stage of the test' };
    const [tpl] = await tx.select().from(formTemplates).where(and(eq(formTemplates.facilityCode, row.facilityCode), eq(formTemplates.stage, stage), eq(formTemplates.active, true)));
    if (!tpl) return { ok: false, error: 'The facility asks no such form' };
    if (stage !== 'incident') {
      const [done] = await tx.select({ id: formResponses.id }).from(formResponses).where(and(eq(formResponses.bookingId, bookingId), eq(formResponses.stage, stage))).limit(1);
      if (done) return { ok: false, error: 'This form is already filled for the booking' };
    }
    const answers = checkAnswers(tpl.items, fieldsOf(fd));
    if (!answers.ok) return answers;
    const [resp] = await tx.insert(formResponses).values({
      bookingId, templateId: tpl.id, stage, version: tpl.version, items: tpl.items, answers: answers.value, filledByUserId: v.userId, filledByName: v.name,
    }).returning({ id: formResponses.id });
    await writeAudit(tx, audit(v, `Booking ${row.b.ref}`, `${FORM_STAGE_LABEL[stage]} filled (version ${tpl.version})`, { entityType: 'form_response', entityId: resp.id, projectCode: row.b.projectCode }));
    if (stage === 'incident') {
      const to = await usersWithRole(tx, ['facility_manager', 'coordinator'], [row.facilityCode]);
      await notify(tx, to, { kind: 'form_incident', title: `Incident reported on a test · ${row.b.ref} · ${row.code}`, href: `/facilities/${encodeURIComponent(row.facilityCode)}?tab=forms` }, { except: v.userId });
    }
    return { ok: true };
  });
  if (r.ok) for (const p of ['/my/schedule', `/facilities/${facilityCode}`]) revalidatePath(p);
  return r;
}
