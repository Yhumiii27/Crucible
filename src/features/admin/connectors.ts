'use server';
// Reading the other tools' views now (CR-060), from the Connectors screen: the administrator, the coordinator or the R&D
// director. The job worker does the same every hour (`connectors-read`). One transaction, audited per view.
import { revalidatePath } from 'next/cache';
import { canReadConnectors } from '@/domain/rights';
import { getDb } from '@/server/db/client';
import { readConnectors, type ReadReport, type ReadView } from '@/server/integrations/connectors';
import { getViewer } from '@/server/session';

export type ActionResult = { ok: true; warnings?: string[] } | { ok: false; error: string };

const VIEW_LABEL: Record<ReadView, string> = {
  'keystone.pub_jalons': 'Keystone milestones',
  'cursus.pub_absences': 'Cursus absences',
  'vigie.pub_controles': 'Vigie inspections',
};

/** "Keystone milestones · 4 read · 1 added · 0 changed · 0 removed" (segments translated one by one). */
const reportText = (r: ReadReport) =>
  r.readable
    ? [VIEW_LABEL[r.view], `${r.read} read`, `${r.added} added`, `${r.changed} changed`, `${r.removed} removed`, ...(r.skipped ? [`${r.skipped} skipped`] : [])].join(' · ')
    : `${VIEW_LABEL[r.view]} · not readable yet`;

export async function readConnectorsAction(): Promise<ActionResult> {
  const v = await getViewer();
  if (!canReadConnectors(v.role)) return { ok: false, error: 'Only the administrator, the coordinator or the R&D director reads the other tools' };
  const db = await getDb();
  const reports = await db.transaction((tx) => readConnectors(tx, { name: v.name, userId: v.userId, role: v.role }));
  for (const p of ['/admin/connectors', '/people', '/propose', '/planning', '/load', '/my/needs']) revalidatePath(p);
  return { ok: true, warnings: reports.map(reportText) };
}
