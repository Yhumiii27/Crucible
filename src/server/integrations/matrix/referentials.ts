import 'server-only';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { writeAudit } from '@/server/db/helpers';
import { entities, sites } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import { emptyReport, sqlList, viewReadable, type ReadBy, type ReadReport } from '@/server/integrations/views';
// Matrix's referentials read into Crucible: matrix.pub_sites (D14, M-6) and matrix.pub_filiales (D21).

/** Sites linked to a Matrix site (D14, M-6): name, city and country follow Matrix. */
export async function readMatrixSites(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = emptyReport('matrix.pub_sites', await viewReadable(tx, 'matrix.pub_sites'));
  if (!rep.readable) return rep;
  const linked = await tx.select().from(sites).where(isNotNull(sites.matrixCode));
  const rows = linked.length
    ? ((await tx.execute(sql`select code, libelle, ville, pays_iso2 from matrix.pub_sites where code in (${sqlList(linked.map((x) => x.matrixCode!))})`)).rows as { code: string; libelle: string | null; ville: string | null; pays_iso2: string | null }[])
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
  const rep = emptyReport('matrix.pub_filiales', await viewReadable(tx, 'matrix.pub_filiales'));
  if (!rep.readable) return rep;
  const linked = await tx.select().from(entities).where(isNotNull(entities.matrixCode));
  const rows = linked.length
    ? ((await tx.execute(sql`select code, nom from matrix.pub_filiales where code in (${sqlList(linked.map((x) => x.matrixCode!))})`)).rows as { code: string; nom: string | null }[])
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
