import 'server-only';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { writeAudit } from '@/server/db/helpers';
import { people, personAbsences } from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { emptyReport, sqlList, viewReadable, type ReadBy, type ReadReport } from '@/server/integrations/views';
// Cursus's pub_ views read into Crucible: cursus.pub_salaries (S-3) and cursus.pub_absences (CU-1).

/** People with a Cursus matricule (S-3): name from Cursus, a person who has left set aside. */
export async function readCursusPeople(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = emptyReport('cursus.pub_salaries', await viewReadable(tx, 'cursus.pub_salaries'));
  if (!rep.readable) return rep;
  const ppl = await tx.select({ id: people.id, name: people.name, matricule: people.matricule, active: people.active }).from(people).where(isNotNull(people.matricule));
  const rows = ppl.length
    ? ((await tx.execute(sql`select matricule, nom, coalesce(actif, true) as actif from cursus.pub_salaries where matricule in (${sqlList(ppl.map((p) => p.matricule!))})`)).rows as { matricule: string; nom: string | null; actif: boolean }[])
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

/** Absences of the people with a Cursus matricule (CU-1). */
export async function readCursusAbsences(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = emptyReport('cursus.pub_absences', await viewReadable(tx, 'cursus.pub_absences'));
  if (!rep.readable) return rep;
  const ppl = await tx.select({ id: people.id, matricule: people.matricule }).from(people).where(and(eq(people.active, true), isNotNull(people.matricule)));
  const byMatricule = new Map(ppl.map((p) => [p.matricule!, p.id]));
  const rows = byMatricule.size
    ? ((await tx.execute(sql`
        select matricule, du::date::text as from_on, au::date::text as to_on from cursus.pub_absences
        where not annulee and statut in ('validee', 'demandee') and matricule in (${sqlList([...byMatricule.keys()])})
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
