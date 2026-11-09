import 'server-only';
// Reading the other tools' pub_ views into Crucible (CR-060, S-2, CU-1, V-1; M-17: reads through pub_ views only). Each view is
// read only once it exists and is granted to crucible_app (a view not published or not granted yet is a state, not an error):
// until then — and for whatever a view does not carry — Crucible works from what is entered in it. What is read is written in
// Crucible's own tables with its source, so the rules, the engine and the screens read one place; a row read from another tool
// is changed in that tool, never in Crucible (the Server Functions refuse it).
//   keystone.pub_jalons   → project_milestones (source keystone), for the projects linked to a Keystone project; a milestone
//                           is dated by the end of its linked activity (the months since the project start cannot be dated:
//                           pub_projets carries no start date) — an undated one is skipped;
//   cursus.pub_absences   → person_absences (source cursus) of the people with a matricule; validated and requested absences
//                           (a planner does not plan on a pending leave), cancelled ones left out;
//   vigie.pub_controles   → inspections (source vigie) of the resources whose code is the control's equipment code (D23:
//                           Vigie is the reference for periodic inspections); an archived control no longer applies;
//   keystone.pub_projets  → the projects linked to a Keystone project (S-1, K-3): their name follows Keystone, a project closed
//                           there is flagged (keystone_closed) — setting it aside stays a person's decision (its bookings);
//                           the R&D projects of Keystone not yet in Crucible are offered on the organisation screen;
//   cursus.pub_salaries   → the people with a matricule (S-3): their name follows Cursus, a person who has left is set aside
//                           (never put back by the read: a planner does it);
//   matrix.pub_sites      → the sites linked to a Matrix site (matrix_code, D14, M-6): name, city and country follow Matrix;
//   matrix.pub_filiales   → the entities linked to a Matrix subsidiary (matrix_code, D21): their name follows Matrix; the sites
//                           and subsidiaries of Matrix not yet in Crucible are offered on the organisation screen;
//   vigie.pub_suspensions_essais → unavailabilities "works" (source vigie) of the resources each Vigie zone holds (V-2, M-21,
//                           vigie_zone_resources kept by the facility managers); the bookings they cover are flagged, never moved.
// Run hourly by the job worker (`connectors-read`) and on demand from the Connectors screen; one transaction, audited.
import { and, eq, gt, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { businessNow, businessToday } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { suspensionPlan, type Suspension } from '@/domain/vigie-suspensions';
import { notify, usersWithRole } from '@/server/notify';
import {
  bookings, entities, inspections, people, personAbsences, projectMilestones, projects, resources, sites, testNeeds, unavailabilities, vigieZoneResources,
} from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';

export const READ_VIEWS = ['keystone.pub_projets', 'keystone.pub_jalons', 'cursus.pub_salaries', 'cursus.pub_absences', 'vigie.pub_controles', 'matrix.pub_sites', 'matrix.pub_filiales', 'vigie.pub_suspensions_essais'] as const;
export type ReadView = (typeof READ_VIEWS)[number];

export interface ReadReport {
  view: ReadView;
  /** false: the view is not published or not granted to Crucible yet. */
  readable: boolean;
  /** Rows of the view about Crucible's projects, people or resources. */
  read: number;
  added: number;
  changed: number;
  removed: number;
  /** Rows read but not usable (undated milestone, control without a last date or a period, milestone a need still serves). */
  skipped: number;
}

export interface ReadBy {
  name: string;
  userId: string | null;
  role: string | null;
}

/** Whether crucible_app may read `schema.view` (catalogue only: never reads the view itself). */
export async function viewReadable(tx: DB | Tx, qualified: string): Promise<boolean> {
  const [schema, name] = qualified.split('.');
  const r = await tx.execute(sql`
    select coalesce(bool_and(has_schema_privilege(n.oid, 'USAGE') and has_table_privilege(c.oid, 'SELECT')), false) as ok
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ${schema} and c.relname = ${name}`);
  return !!(r.rows[0] as { ok: boolean } | undefined)?.ok;
}

const empty = (view: ReadView, readable: boolean): ReadReport => ({ view, readable, read: 0, added: 0, changed: 0, removed: 0, skipped: 0 });
const list = (values: readonly string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);

/** Milestones of the projects linked to a Keystone project (S-2, K-2). */
export async function readKeystoneMilestones(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = empty('keystone.pub_jalons', await viewReadable(tx, 'keystone.pub_jalons'));
  if (!rep.readable) return rep;
  const linked = await tx.select({ code: projects.code, keystone: projects.keystoneCode }).from(projects).where(and(eq(projects.active, true), isNotNull(projects.keystoneCode)));
  const byKeystone = new Map(linked.map((p) => [p.keystone!, p.code]));
  const rows = byKeystone.size
    ? ((await tx.execute(sql`
        select projet_code, jalon_id::text as jalon_id, nom, date_fin_activite::date::text as due_on
        from keystone.pub_jalons where projet_code in (${list([...byKeystone.keys()])})`)).rows as { projet_code: string; jalon_id: string; nom: string; due_on: string | null }[])
    : [];
  rep.read = rows.length;
  const existing = await tx.select().from(projectMilestones).where(eq(projectMilestones.source, 'keystone'));
  const kept = new Set<string>();
  for (const r of rows) {
    if (!r.due_on) { rep.skipped++; continue; }
    const projectCode = byKeystone.get(r.projet_code)!;
    const before = existing.find((m) => m.sourceRef === r.jalon_id);
    kept.add(r.jalon_id);
    if (!before) {
      await tx.insert(projectMilestones).values({ projectCode, label: r.nom, dueOn: r.due_on, source: 'keystone', sourceRef: r.jalon_id, updatedByName: 'Keystone' });
      rep.added++;
    } else if (before.label !== r.nom || before.dueOn !== r.due_on || before.projectCode !== projectCode) {
      await tx.update(projectMilestones).set({ projectCode, label: r.nom, dueOn: r.due_on, updatedByName: 'Keystone', updatedAt: new Date() }).where(eq(projectMilestones.id, before.id));
      rep.changed++;
    }
  }
  // Milestones no longer published (or no longer dated): removed, unless a need still serves one (it keeps its last date).
  for (const m of existing.filter((x) => !kept.has(x.sourceRef ?? ''))) {
    const [used] = await tx.select({ ref: testNeeds.ref }).from(testNeeds).where(eq(testNeeds.milestoneId, m.id)).limit(1);
    if (used) { rep.skipped++; continue; }
    await tx.delete(projectMilestones).where(eq(projectMilestones.id, m.id));
    rep.removed++;
  }
  if (rep.added || rep.changed || rep.removed) {
    await writeAudit(tx, { actorName: by.name, actorUserId: by.userId, actorRole: by.role, area: 'Projects', objectRef: 'keystone.pub_jalons', change: `milestones read from Keystone: ${rep.added} added, ${rep.changed} changed, ${rep.removed} removed`, entityType: 'connector', after: { ...rep } });
  }
  return rep;
}

/** Absences of the people with a Cursus matricule (CU-1). */
export async function readCursusAbsences(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = empty('cursus.pub_absences', await viewReadable(tx, 'cursus.pub_absences'));
  if (!rep.readable) return rep;
  const ppl = await tx.select({ id: people.id, matricule: people.matricule }).from(people).where(and(eq(people.active, true), isNotNull(people.matricule)));
  const byMatricule = new Map(ppl.map((p) => [p.matricule!, p.id]));
  const rows = byMatricule.size
    ? ((await tx.execute(sql`
        select matricule, du::date::text as from_on, au::date::text as to_on from cursus.pub_absences
        where not annulee and statut in ('validee', 'demandee') and matricule in (${list([...byMatricule.keys()])})
        order by matricule, du`)).rows as { matricule: string; from_on: string; to_on: string }[])
    : [];
  rep.read = rows.length;
  const key = (personId: string, from: string, to: string) => `${personId}|${from}|${to}`;
  const existing = ppl.length
    ? await tx.select().from(personAbsences).where(and(eq(personAbsences.source, 'cursus'), inArray(personAbsences.personId, ppl.map((p) => p.id))))
    : [];
  const had = new Map(existing.map((a) => [key(a.personId, a.fromOn, a.toOn), a.id]));
  const want = new Set<string>();
  for (const r of rows) {
    if (r.to_on < r.from_on) { rep.skipped++; continue; }
    const personId = byMatricule.get(r.matricule)!;
    const k = key(personId, r.from_on, r.to_on);
    if (want.has(k)) continue;
    want.add(k);
    if (!had.has(k)) {
      await tx.insert(personAbsences).values({ personId, fromOn: r.from_on, toOn: r.to_on, source: 'cursus', createdByName: 'Cursus' });
      rep.added++;
    }
  }
  const gone = [...had].filter(([k]) => !want.has(k)).map(([, id]) => id);
  if (gone.length) await tx.delete(personAbsences).where(inArray(personAbsences.id, gone));
  rep.removed = gone.length;
  if (rep.added || rep.removed) {
    await writeAudit(tx, { actorName: by.name, actorUserId: by.userId, actorRole: by.role, area: 'People', objectRef: 'cursus.pub_absences', change: `absences read from Cursus: ${rep.added} added, ${rep.removed} removed`, entityType: 'connector', after: { ...rep } });
  }
  return rep;
}

/** Periodic inspections of the resources, by the common equipment code (V-1, D23). */
export async function readVigieInspections(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = empty('vigie.pub_controles', await viewReadable(tx, 'vigie.pub_controles'));
  if (!rep.readable) return rep;
  const res = await tx.select({ id: resources.id, code: resources.code }).from(resources);
  const byCode = new Map(res.map((r) => [r.code, r.id]));
  const rows = byCode.size
    ? ((await tx.execute(sql`
        select vigie_ref, equipement_code, type_controle, periodicite_mois, dernier_le::date::text as last_on, archive
        from vigie.pub_controles where equipement_code in (${list([...byCode.keys()])})`)).rows as {
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

/** Reads every view Crucible copies from (in one transaction). */
export async function readConnectors(tx: Tx, by: ReadBy): Promise<ReadReport[]> {
  // People and projects first: the absences and milestones read next are those of the people and projects still in use.
  return [await readKeystoneProjects(tx, by), await readKeystoneMilestones(tx, by), await readCursusPeople(tx, by), await readCursusAbsences(tx, by), await readVigieInspections(tx, by),
    await readMatrixSites(tx, by), await readMatrixEntities(tx, by), await readVigieSuspensions(tx, by)];
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
  const rep = empty('vigie.pub_suspensions_essais', await viewReadable(tx, 'vigie.pub_suspensions_essais'));
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

/** Sites linked to a Matrix site (D14, M-6): name, city and country follow Matrix. */
export async function readMatrixSites(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = empty('matrix.pub_sites', await viewReadable(tx, 'matrix.pub_sites'));
  if (!rep.readable) return rep;
  const linked = await tx.select().from(sites).where(isNotNull(sites.matrixCode));
  const rows = linked.length
    ? ((await tx.execute(sql`select code, libelle, ville, pays_iso2 from matrix.pub_sites where code in (${list(linked.map((x) => x.matrixCode!))})`)).rows as { code: string; libelle: string | null; ville: string | null; pays_iso2: string | null }[])
    : [];
  rep.read = rows.length;
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const lines: string[] = [];
  for (const site of linked) {
    const r = byCode.get(site.matrixCode!);
    if (!r) { rep.skipped++; continue; }
    const next = { name: r.libelle?.trim() || site.name, city: r.ville?.trim() || null, countryIso2: (r.pays_iso2 ?? site.countryIso2).toUpperCase().slice(0, 2) };
    if (next.name === site.name && next.city === site.city && next.countryIso2 === site.countryIso2) continue;
    await tx.update(sites).set({ ...next, updatedAt: new Date() }).where(eq(sites.code, site.code));
    rep.changed++;
    lines.push(`${site.code} ← ${site.matrixCode}`);
  }
  if (lines.length) {
    await writeAudit(tx, { actorName: by.name, actorUserId: by.userId, actorRole: by.role, area: 'Administration', objectRef: 'matrix.pub_sites', change: `sites read from Matrix: ${lines.join('; ')}`, entityType: 'connector', after: { ...rep } });
  }
  return rep;
}

/** Entities linked to a Matrix subsidiary (D21): their name follows Matrix. */
export async function readMatrixEntities(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = empty('matrix.pub_filiales', await viewReadable(tx, 'matrix.pub_filiales'));
  if (!rep.readable) return rep;
  const linked = await tx.select().from(entities).where(isNotNull(entities.matrixCode));
  const rows = linked.length
    ? ((await tx.execute(sql`select code, nom from matrix.pub_filiales where code in (${list(linked.map((x) => x.matrixCode!))})`)).rows as { code: string; nom: string | null }[])
    : [];
  rep.read = rows.length;
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const lines: string[] = [];
  for (const e of linked) {
    const r = byCode.get(e.matrixCode!);
    if (!r) { rep.skipped++; continue; }
    const name = r.nom?.trim() || e.name;
    if (name === e.name) continue;
    await tx.update(entities).set({ name, updatedAt: new Date() }).where(eq(entities.code, e.code));
    rep.changed++;
    lines.push(`${e.code} name "${e.name}" → "${name}"`);
  }
  if (lines.length) {
    await writeAudit(tx, { actorName: by.name, actorUserId: by.userId, actorRole: by.role, area: 'Administration', objectRef: 'matrix.pub_filiales', change: `entities read from Matrix: ${lines.join('; ')}`, entityType: 'connector', after: { ...rep } });
  }
  return rep;
}

export interface MatrixSite {
  code: string;
  name: string;
  city: string | null;
  countryIso2: string;
  /** Code of the Crucible site linked to it, else null. */
  linkedTo: string | null;
}

export interface MatrixSubsidiary {
  code: string;
  name: string;
  linkedTo: string | null;
}

/** The sites and subsidiaries of Matrix, with the Crucible site or entity linked to each (empty while a view is not granted). */
export async function matrixReferentials(q: DB | Tx): Promise<{ sites: MatrixSite[]; subsidiaries: MatrixSubsidiary[] }> {
  const [siteRows, subRows] = await Promise.all([
    viewReadable(q, 'matrix.pub_sites').then((ok) => (ok ? q.execute(sql`select code, libelle, ville, pays_iso2 from matrix.pub_sites where coalesce(actif, true) order by ordre, code`) : null)),
    viewReadable(q, 'matrix.pub_filiales').then((ok) => (ok ? q.execute(sql`select code, nom from matrix.pub_filiales where coalesce(actif, true) order by ordre, code`) : null)),
  ]);
  const [ourSites, ourEntities] = await Promise.all([
    q.select({ code: sites.code, m: sites.matrixCode }).from(sites).where(isNotNull(sites.matrixCode)),
    q.select({ code: entities.code, m: entities.matrixCode }).from(entities).where(isNotNull(entities.matrixCode)),
  ]);
  const siteOf = new Map(ourSites.map((x) => [x.m!, x.code]));
  const entityOf = new Map(ourEntities.map((x) => [x.m!, x.code]));
  return {
    sites: ((siteRows?.rows ?? []) as { code: string; libelle: string | null; ville: string | null; pays_iso2: string | null }[]).map((r) => ({
      code: r.code, name: r.libelle ?? r.code, city: r.ville, countryIso2: (r.pays_iso2 ?? 'FR').toUpperCase().slice(0, 2), linkedTo: siteOf.get(r.code) ?? null,
    })),
    subsidiaries: ((subRows?.rows ?? []) as { code: string; nom: string | null }[]).map((r) => ({ code: r.code, name: r.nom ?? r.code, linkedTo: entityOf.get(r.code) ?? null })),
  };
}

/** Projects linked to a Keystone project (S-1, K-3): name from Keystone, closed there flagged. */
export async function readKeystoneProjects(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = empty('keystone.pub_projets', await viewReadable(tx, 'keystone.pub_projets'));
  if (!rep.readable) return rep;
  const linked = await tx.select({ code: projects.code, keystone: projects.keystoneCode, name: projects.name, closed: projects.keystoneClosed }).from(projects).where(isNotNull(projects.keystoneCode));
  const rows = linked.length
    ? ((await tx.execute(sql`select code, nom, coalesce(imputable, true) as imputable from keystone.pub_projets where code in (${list(linked.map((p) => p.keystone!))})`)).rows as { code: string; nom: string | null; imputable: boolean }[])
    : [];
  rep.read = rows.length;
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const lines: string[] = [];
  for (const p of linked) {
    const r = byCode.get(p.keystone!);
    if (!r) { rep.skipped++; continue; }
    const name = r.nom?.trim() || p.name;
    const closed = !r.imputable;
    if (name === p.name && closed === p.closed) continue;
    await tx.update(projects).set({ name, keystoneClosed: closed, updatedAt: new Date() }).where(eq(projects.code, p.code));
    rep.changed++;
    lines.push(`${p.code}${name !== p.name ? ` name "${p.name}" → "${name}"` : ''}${closed !== p.closed ? (closed ? ' closed in Keystone' : ' open again in Keystone') : ''}`);
  }
  if (rep.changed) {
    await writeAudit(tx, { actorName: by.name, actorUserId: by.userId, actorRole: by.role, area: 'Projects', objectRef: 'keystone.pub_projets', change: `projects read from Keystone: ${lines.join('; ')}`, entityType: 'connector', after: { ...rep } });
  }
  return rep;
}

/** The R&D projects of Keystone still open and not linked to a Crucible project (offered on the organisation screen). */
export async function keystoneRdProjectsToAdd(q: DB | Tx): Promise<{ code: string; name: string; entityCode: string | null }[]> {
  if (!(await viewReadable(q, 'keystone.pub_projets'))) return [];
  const linked = (await q.select({ k: projects.keystoneCode }).from(projects).where(isNotNull(projects.keystoneCode))).map((p) => p.k!);
  const rows = (await q.execute(sql`
    select code, nom, filiale_code from keystone.pub_projets
    where categorie = 'rd' and coalesce(imputable, true) ${linked.length ? sql`and code not in (${list(linked)})` : sql``}
    order by code`)).rows as { code: string; nom: string | null; filiale_code: string | null }[];
  return rows.map((r) => ({ code: r.code, name: r.nom ?? r.code, entityCode: r.filiale_code }));
}

/** People with a Cursus matricule (S-3): name from Cursus, a person who has left set aside. */
export async function readCursusPeople(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = empty('cursus.pub_salaries', await viewReadable(tx, 'cursus.pub_salaries'));
  if (!rep.readable) return rep;
  const ppl = await tx.select({ id: people.id, name: people.name, matricule: people.matricule, active: people.active }).from(people).where(isNotNull(people.matricule));
  const rows = ppl.length
    ? ((await tx.execute(sql`select matricule, nom, coalesce(actif, true) as actif from cursus.pub_salaries where matricule in (${list(ppl.map((p) => p.matricule!))})`)).rows as { matricule: string; nom: string | null; actif: boolean }[])
    : [];
  rep.read = rows.length;
  const byMatricule = new Map(rows.map((r) => [r.matricule, r]));
  const lines: string[] = [];
  for (const p of ppl) {
    const r = byMatricule.get(p.matricule!);
    if (!r) { rep.skipped++; continue; }
    const name = r.nom?.trim() || p.name;
    const leave = p.active && !r.actif;
    if (name === p.name && !leave) continue;
    await tx.update(people).set({ name, ...(leave ? { active: false } : {}), updatedByName: 'Cursus', updatedAt: new Date() }).where(eq(people.id, p.id));
    if (leave) rep.removed++;
    else rep.changed++;
    lines.push(`${p.matricule}${name !== p.name ? ` name "${p.name}" → "${name}"` : ''}${leave ? ' left (set aside)' : ''}`);
  }
  if (lines.length) {
    await writeAudit(tx, { actorName: by.name, actorUserId: by.userId, actorRole: by.role, area: 'People', objectRef: 'cursus.pub_salaries', change: `people read from Cursus: ${lines.join('; ')}`, entityType: 'connector', after: { ...rep } });
  }
  return rep;
}

/** One line per view, for the job log and the screen. */
export const reportLine = (r: ReadReport) =>
  r.readable ? `${r.view}: ${r.read} read, ${r.added} added, ${r.changed} changed, ${r.removed} removed${r.skipped ? `, ${r.skipped} skipped` : ''}` : `${r.view}: not readable`;
