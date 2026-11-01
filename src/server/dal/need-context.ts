import 'server-only';
// What a test need may refer to, as the viewer sees it, and the warnings of a need (F-5): shared by the needs Server Functions
// (src/features/needs/actions.ts) and the assistant's need drafts (src/server/assistant/facts.ts), so both validate a need the
// same way.
import { and, eq, ne } from 'drizzle-orm';
import { ISSUE_LABEL } from '@/domain/booking';
import { DEFAULT_NOTICE_WORKDAYS, isLateRequest, type NeedInput } from '@/domain/needs';
import { canSeeFacility, facilityVisibility } from '@/domain/rights';
import { entityAgreements, facilities, facilityPartners, projectMilestones, resources, testTypes } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import type { Viewer } from '@/server/viewer';

type Q = DB | Tx;

/** What a need of the project may refer to, as the viewer sees it: resources of the visible facilities, the project's milestones, the catalogue. */
export async function needContext(tx: Q, v: Viewer, projectCode: string, today: string) {
  const vis = facilityVisibility(v.role, v.assignments);
  const [facs, partners, res, ms, types] = await Promise.all([
    tx.select().from(facilities).where(eq(facilities.active, true)),
    tx.select().from(facilityPartners),
    tx.select({ id: resources.id, facilityCode: resources.facilityCode }).from(resources).where(ne(resources.status, 'retired')),
    tx.select({ id: projectMilestones.id, dueOn: projectMilestones.dueOn }).from(projectMilestones).where(eq(projectMilestones.projectCode, projectCode)),
    tx.select({ code: testTypes.code }).from(testTypes).where(eq(testTypes.active, true)),
  ]);
  const visible = new Set(facs.filter((f) => canSeeFacility(vis, { code: f.code, operatorEntityCode: f.operatorEntityCode, partnerEntityCodes: partners.filter((p) => p.facilityCode === f.code).map((p) => p.entityCode) })).map((f) => f.code));
  return {
    resources: new Set(res.filter((r) => visible.has(r.facilityCode)).map((r) => r.id)),
    facilityOf: new Map(res.map((r) => [r.id, r.facilityCode])),
    milestones: new Map(ms.map((m) => [m.id, { dueOn: m.dueOn }])),
    testTypes: new Set(types.map((x) => x.code)),
    today,
  };
}

/** Working days of notice asked of an entity on a facility: its agreement's, else the rule for everyone (F-5). */
async function noticeOf(tx: Q, facilityCode: string, entityCode: string): Promise<number> {
  const [a] = await tx.select({ n: entityAgreements.noticeWorkdays }).from(entityAgreements).where(and(eq(entityAgreements.facilityCode, facilityCode), eq(entityAgreements.entityCode, entityCode)));
  return a?.n ?? DEFAULT_NOTICE_WORKDAYS;
}

export async function needWarnings(tx: Q, n: NeedInput, facilityCode: string, entityCode: string, today: string, warnings: string[] = []): Promise<string[]> {
  const late = n.level === 'request' && isLateRequest(today, n.earliestOn, await noticeOf(tx, facilityCode, entityCode));
  return late ? [...warnings, ISSUE_LABEL.late_request] : warnings;
}
