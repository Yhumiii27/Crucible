import 'server-only';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { businessNow, businessToday } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { suspensionPlan, type Suspension } from '@/domain/vigie-suspensions';
import { notify, usersWithRole } from '@/server/notify';
import { bookings, inspections, resources, unavailabilities, vigieZoneResources } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import { emptyReport, sqlList, viewReadable, type ReadBy, type ReadReport } from '@/server/integrations/views';
// Vigie's pub_ views read into Crucible: vigie.pub_controles (V-1, D23) and vigie.pub_suspensions_essais (V-2, M-21).

/** Periodic inspections of the resources, by the common equipment code (V-1, D23). */
export async function readVigieInspections(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = emptyReport('vigie.pub_controles', await viewReadable(tx, 'vigie.pub_controles'));
  if (!rep.readable) return rep;
  const res = await tx.select({ id: resources.id, code: resources.code }).from(resources);
  const byCode = new Map(res.map((r) => [r.code, r.id]));
  const rows = byCode.size
    ? ((await tx.execute(sql`
        select vigie_ref, equipement_code, type_controle, periodicite_mois, dernier_le::date::text as last_on, archive
        from vigie.pub_controles where equipement_code in (${sqlList([...byCode.keys()])})`)).rows as {
        vigie_ref: string; equipement_code: string; type_controle: string; periodicite_mois: number | null; last_on: string | null; archive: boolean;
      }[])
    : [];
  rep.read = rows.length;
  const existing = await tx.select().from(inspections);
  const kept = new Set<string>();
  for (const r of rows) {
    const period = Number(r.periodicite_mois);
    if (!r.last_on || !Number.isInteger(period) || period < 1 || period > 120 || !r.type_controle?.trim()) { rep.skipped++; continue; }
    const resourceId = byCode.get(r.equipement_code)!;
    const label = r.type_controle.trim();
    // The same control, or an inspection entered in Crucible with the same label on the resource: it becomes Vigie's.
    const before = existing.find((i) => i.source === 'vigie' && i.sourceRef === r.vigie_ref) ?? existing.find((i) => i.resourceId === resourceId && i.label === label);
    const row = { resourceId, label, periodMonths: period, lastOn: r.last_on, active: !r.archive, source: 'vigie', sourceRef: r.vigie_ref, updatedByName: 'Vigie' };
    kept.add(r.vigie_ref);
    if (!before) {
      await tx.insert(inspections).values(row).onConflictDoUpdate({ target: [inspections.resourceId, inspections.label], set: { ...row, updatedAt: new Date() } });
      rep.added++;
    } else if (before.lastOn !== row.lastOn || before.periodMonths !== row.periodMonths || before.active !== row.active || before.label !== label || before.resourceId !== resourceId || before.source !== 'vigie') {
      await tx.update(inspections).set({ ...row, updatedAt: new Date() }).where(eq(inspections.id, before.id));
      rep.changed++;
    }
  }
  // A control Vigie no longer publishes for a Crucible resource no longer applies.
  const gone = existing.filter((i) => i.source === 'vigie' && i.active && !kept.has(i.sourceRef ?? ''));
  if (gone.length) await tx.update(inspections).set({ active: false, updatedByName: 'Vigie', updatedAt: new Date() }).where(inArray(inspections.id, gone.map((i) => i.id)));
  rep.removed = gone.length;
  if (rep.added || rep.changed || rep.removed) {
    await writeAudit(tx, { actorName: by.name, actorUserId: by.userId, actorRole: by.role, area: 'Facilities', objectRef: 'vigie.pub_controles', change: `inspections read from Vigie: ${rep.added} added, ${rep.changed} changed, ${rep.removed} no longer applied`, entityType: 'connector', after: { ...rep } });
  }
  return rep;
}

/** A zone of Vigie's site map where tests are suspended during outside interventions (V-2). */
export interface VigieZone {
  id: number;
  name: string;
  kind: string;
  siteCode: string | null;
}

/** The zones Vigie publishes suspensions for (from the suspensions still to come), or null while the view is not readable. */
export async function vigieZones(given?: DB | Tx): Promise<VigieZone[] | null> {
  const q = given ?? (await getDb());
  if (!(await viewReadable(q, 'vigie.pub_suspensions_essais'))) return null;
  const rows = (await q.execute(sql`
    select distinct zone_id, zone_nom, zone_type, site_code from vigie.pub_suspensions_essais order by zone_nom`)).rows as { zone_id: number; zone_nom: string; zone_type: string; site_code: string | null }[];
  return rows.map((r) => ({ id: Number(r.zone_id), name: r.zone_nom, kind: r.zone_type, siteCode: r.site_code }));
}

/**
 * Test suspensions of Vigie's zones (V-2, M-21): each makes the resources the zone holds unavailable ("works", whole days);
 * a suspension withdrawn in Vigie stops being an unavailability unless already over. The managers and coordinators of the
 * facility are notified of the requested or confirmed bookings an added or changed suspension covers (nothing is moved).
 */
export async function readVigieSuspensions(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = emptyReport('vigie.pub_suspensions_essais', await viewReadable(tx, 'vigie.pub_suspensions_essais'));
  if (!rep.readable) return rep;
  const zones = await tx.select({ zoneId: vigieZoneResources.zoneId, resourceId: vigieZoneResources.resourceId }).from(vigieZoneResources);
  const zoneIds = [...new Set(zones.map((z) => z.zoneId))];
  const day = await businessToday(tx);
  const now = await businessNow(tx);
  const rows = zoneIds.length
    ? ((await tx.execute(sql`
        select activite_id, zone_id, zone_nom, du::date::text as from_on, au::date::text as to_on, plage_horaire, entreprise, motif
        from vigie.pub_suspensions_essais where zone_id in (${sql.join(zoneIds.map((z) => sql`${z}`), sql`, `)})`)).rows as {
        activite_id: number; zone_id: number; zone_nom: string; from_on: string | null; to_on: string | null; plage_horaire: string | null; entreprise: string | null; motif: string | null;
      }[])
    : [];
  rep.read = rows.length;
  const suspensions: Suspension[] = rows.map((r) => ({
    activiteId: Number(r.activite_id), zoneId: Number(r.zone_id), zoneName: r.zone_nom ?? '', fromOn: r.from_on ?? '', toOn: r.to_on ?? '',
    timeRange: r.plage_horaire, company: r.entreprise, reason: r.motif,
  }));
  const existing = await tx.select().from(unavailabilities).where(eq(unavailabilities.source, 'vigie'));
  const plan = suspensionPlan(suspensions, zones, existing, day, now);
  rep.skipped = plan.skipped;
  for (const a of plan.add) {
    await tx.insert(unavailabilities).values({ ...a, kind: 'works', source: 'vigie', createdByName: 'Vigie' });
    rep.added++;
  }
  for (const c of plan.change) {
    await tx.update(unavailabilities).set({ label: c.label, startsAt: c.startsAt, endsAt: c.endsAt, updatedAt: new Date() }).where(eq(unavailabilities.id, c.id));
    rep.changed++;
  }
  if (plan.remove.length) await tx.delete(unavailabilities).where(inArray(unavailabilities.id, plan.remove));
  rep.removed = plan.remove.length;
  // The bookings an added suspension, or one whose days changed, covers: flagged to the facility's managers (a change of its
  // text alone flags nothing again).
  const moved = plan.change.filter((c) => {
    const before = existing.find((x) => x.id === c.id)!;
    return before.startsAt.getTime() !== c.startsAt.getTime() || before.endsAt.getTime() !== c.endsAt.getTime();
  });
  for (const u of [...plan.add, ...moved]) {
    const covered = await tx.select({ id: bookings.id, ref: bookings.ref, code: resources.code, facilityCode: resources.facilityCode }).from(bookings)
      .innerJoin(resources, eq(resources.id, bookings.resourceId))
      .where(and(eq(bookings.resourceId, u.resourceId), inArray(bookings.status, ['requested', 'confirmed']), lt(bookings.startsAt, u.endsAt), gt(bookings.endsAt, u.startsAt)));
    for (const b of covered) {
      const to = await usersWithRole(tx, ['facility_manager', 'coordinator'], [b.facilityCode]);
      await notify(tx, to, { kind: 'outside_works', title: `Outside works on a booked resource · ${b.ref} · ${b.code} · ${u.label}`, href: `/facilities/${encodeURIComponent(b.facilityCode)}?tab=calendar`, bookingId: b.id }, { at: now });
    }
  }
  if (rep.added || rep.changed || rep.removed) {
    await writeAudit(tx, { actorName: by.name, actorUserId: by.userId, actorRole: by.role, area: 'Facilities', objectRef: 'vigie.pub_suspensions_essais', change: `test suspensions read from Vigie: ${rep.added} added, ${rep.changed} changed, ${rep.removed} withdrawn`, entityType: 'connector', after: { ...rep } });
  }
  return rep;
}
