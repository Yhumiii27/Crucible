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
//                           Vigie is the reference for periodic inspections); an archived control no longer applies.
// Run hourly by the job worker (`connectors-read`) and on demand from the Connectors screen; one transaction, audited.
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { writeAudit } from '@/server/db/helpers';
import { inspections, people, personAbsences, projectMilestones, projects, resources, testNeeds } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';

export const READ_VIEWS = ['keystone.pub_jalons', 'cursus.pub_absences', 'vigie.pub_controles'] as const;
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
  return [await readKeystoneMilestones(tx, by), await readCursusAbsences(tx, by), await readVigieInspections(tx, by)];
}

/** One line per view, for the job log and the screen. */
export const reportLine = (r: ReadReport) =>
  r.readable ? `${r.view}: ${r.read} read, ${r.added} added, ${r.changed} changed, ${r.removed} removed${r.skipped ? `, ${r.skipped} skipped` : ''}` : `${r.view}: not readable`;
