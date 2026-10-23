import 'server-only';
// What waits for the viewer's decision (delivery 5b, "To decide"): conflict sheets to arbitrate (and to veto, for the safety
// officer), recovery and urgency scenarios submitted, the open proposals of the latest engine run, the needs it could not place.
// One list for the "To decide" screen, the home page and the count of the menu. A need is described only to those who see its
// project (U-3): otherwise its reference alone.
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Move } from '@/domain/recovery';
import type { UnplacedReason } from '@/domain/planning-vocabulary';
import { canSeeProject, managedFacilities, projectVisibility } from '@/domain/rights';
import { getDb } from '@/server/db/client';
import { conflicts, incidents, planRuns, projects, proposals, resources, scenarios, testNeeds } from '@/server/db/schema';
import type { Viewer } from '@/server/viewer';

export type DecisionItem =
  | { kind: 'conflict'; ref: string; subject: string; needs: string[]; dueOn: string; vetoed: boolean; href: string }
  | { kind: 'scenario'; ref: string; scenarioKind: string; incidentRef: string | null; moves: number; href: string }
  | { kind: 'proposals'; ref: string; count: number; late: number; href: string }
  | { kind: 'unplaced'; ref: string; projectCode: string | null; title: string | null; reason: UnplacedReason; href: string };

export interface DecisionQueue {
  items: DecisionItem[];
  /** Open proposals of the latest run (count of the "Slot proposals" entry). */
  openProposals: number;
  /** Conflicts open or vetoed (count of the "Conflicts" entry). */
  openConflicts: number;
}

const EMPTY: DecisionQueue = { items: [], openProposals: 0, openConflicts: 0 };

export async function decisionQueue(viewer: Viewer): Promise<DecisionQueue> {
  const role = viewer.role;
  if (role !== 'rd_director' && role !== 'coordinator' && role !== 'safety') return EMPTY;
  const db = await getDb();
  const pv = projectVisibility(role, viewer.assignments);
  const mine = managedFacilities(role, viewer.assignments);
  const label = (n: { ref: string; projectCode: string; entityCode: string; confidential: boolean }) =>
    canSeeProject(pv, { code: n.projectCode, entityCode: n.entityCode, confidential: n.confidential }) ? `${n.ref} · ${n.projectCode}` : n.ref;

  const open = await db.select().from(conflicts).where(inArray(conflicts.status, ['open', 'vetoed'])).orderBy(asc(conflicts.dueOn));
  const needIds = [...new Set(open.flatMap((c) => c.needIds))];
  const needRows = needIds.length
    ? await db.select({ id: testNeeds.id, ref: testNeeds.ref, projectCode: testNeeds.projectCode, entityCode: projects.entityCode, confidential: projects.confidential })
      .from(testNeeds).innerJoin(projects, eq(projects.code, testNeeds.projectCode)).where(inArray(testNeeds.id, needIds))
    : [];
  const needOf = new Map(needRows.map((n) => [n.id, n]));
  const items: DecisionItem[] = open
    // The safety officer acts on the open sheets (veto); a vetoed sheet waits for the deciders.
    .filter((c) => role !== 'safety' || c.status === 'open')
    .map((c) => ({
      kind: 'conflict' as const, ref: c.ref, subject: c.subject, dueOn: c.dueOn, vetoed: c.status === 'vetoed', href: '/conflicts',
      // By reference: the ids are random, their order is not the reader's.
      needs: c.needIds.map((id) => needOf.get(id)).filter((n) => !!n).sort((a, b) => a!.ref.localeCompare(b!.ref)).map((n) => label(n!)),
    }));
  if (role === 'safety') return { items, openProposals: 0, openConflicts: items.length };

  // Scenarios the viewer may decide: the R&D director all, a coordinator those whose moves stay in the facilities they coordinate.
  const sc = await db.select({ s: scenarios, incidentRef: incidents.ref }).from(scenarios).leftJoin(incidents, eq(incidents.id, scenarios.incidentId))
    .where(eq(scenarios.status, 'submitted')).orderBy(asc(scenarios.createdAt));
  const resFacility = new Map((await db.select({ id: resources.id, f: resources.facilityCode }).from(resources)).map((r) => [r.id, r.f]));
  for (const { s, incidentRef } of sc) {
    const moves = s.moves as unknown as Move[];
    const touched = moves.map((m) => resFacility.get(m.from.resourceId) ?? '');
    if (role === 'coordinator' && !touched.every((f) => mine.includes(f))) continue;
    items.push({ kind: 'scenario', ref: s.ref, scenarioKind: s.kind, incidentRef, moves: moves.length, href: '/incidents' });
  }

  const [run] = await db.select().from(planRuns).orderBy(desc(planRuns.runAt)).limit(1);
  let openProposals = 0;
  if (run) {
    const props = await db.select({ lateDays: proposals.lateDays }).from(proposals).where(and(eq(proposals.runId, run.id), eq(proposals.status, 'proposed')));
    openProposals = props.length;
    if (props.length) items.push({ kind: 'proposals', ref: run.ref, count: props.length, late: props.filter((p) => p.lateDays > 0).length, href: '/propose' });
    const unplaced = (run.summary.unplaced as { needId: string; needRef: string; reason: UnplacedReason }[] | undefined) ?? [];
    if (unplaced.length) {
      const rows = await db.select({ id: testNeeds.id, ref: testNeeds.ref, title: testNeeds.title, status: testNeeds.status, projectCode: testNeeds.projectCode, entityCode: projects.entityCode, confidential: projects.confidential })
        .from(testNeeds).innerJoin(projects, eq(projects.code, testNeeds.projectCode)).where(inArray(testNeeds.id, unplaced.map((u) => u.needId)));
      for (const u of unplaced) {
        const n = rows.find((r) => r.id === u.needId);
        if (!n || n.status !== 'open') continue;
        const seen = canSeeProject(pv, { code: n.projectCode, entityCode: n.entityCode, confidential: n.confidential });
        items.push({ kind: 'unplaced', ref: n.ref, projectCode: seen ? n.projectCode : null, title: seen ? n.title : null, reason: u.reason, href: '/propose' });
      }
    }
  }
  return { items, openProposals, openConflicts: open.length };
}
