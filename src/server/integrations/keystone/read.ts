import 'server-only';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { writeAudit } from '@/server/db/helpers';
import { projectMilestones, projects, testNeeds } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import { emptyReport, sqlList, viewReadable, type ReadBy, type ReadReport } from '@/server/integrations/views';
// Keystone's pub_ views read into Crucible: keystone.pub_projets (S-1, K-3) and keystone.pub_jalons (S-2, K-2).

/** Projects linked to a Keystone project (S-1, K-3): name from Keystone, closed there flagged. */
export async function readKeystoneProjects(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = emptyReport('keystone.pub_projets', await viewReadable(tx, 'keystone.pub_projets'));
  if (!rep.readable) return rep;
  const linked = await tx.select({ code: projects.code, keystone: projects.keystoneCode, name: projects.name, closed: projects.keystoneClosed }).from(projects).where(isNotNull(projects.keystoneCode));
  const rows = linked.length
    ? ((await tx.execute(sql`select code, nom, coalesce(imputable, true) as imputable from keystone.pub_projets where code in (${sqlList(linked.map((p) => p.keystone!))})`)).rows as { code: string; nom: string | null; imputable: boolean }[])
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
    where categorie = 'rd' and coalesce(imputable, true) ${linked.length ? sql`and code not in (${sqlList(linked)})` : sql``}
    order by code`)).rows as { code: string; nom: string | null; filiale_code: string | null }[];
  return rows.map((r) => ({ code: r.code, name: r.nom ?? r.code, entityCode: r.filiale_code }));
}

/** Milestones of the projects linked to a Keystone project (S-2, K-2). */
export async function readKeystoneMilestones(tx: Tx, by: ReadBy): Promise<ReadReport> {
  const rep = emptyReport('keystone.pub_jalons', await viewReadable(tx, 'keystone.pub_jalons'));
  if (!rep.readable) return rep;
  const linked = await tx.select({ code: projects.code, keystone: projects.keystoneCode }).from(projects).where(and(eq(projects.active, true), isNotNull(projects.keystoneCode)));
  const byKeystone = new Map(linked.map((p) => [p.keystone!, p.code]));
  const rows = byKeystone.size
    ? ((await tx.execute(sql`
        select projet_code, jalon_id::text as jalon_id, nom, date_fin_activite::date::text as due_on
        from keystone.pub_jalons where projet_code in (${sqlList([...byKeystone.keys()])})`)).rows as { projet_code: string; jalon_id: string; nom: string; due_on: string | null }[])
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
