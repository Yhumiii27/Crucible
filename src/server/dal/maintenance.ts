import 'server-only';
// Maintenance and calibration of a facility's resources (CR-073): the active plans with their due date and state, computed
// from the business date, and the interventions recorded over the last year. Called after the facility sheet, which applies
// the viewer's visibility.
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { maintenanceDueOn, maintenanceState } from '@/domain/maintenance';
import { addDaysIso } from '@/lib/dates';
import { getDb } from '@/server/db/client';
import { maintenancePlans, maintenanceRecords, resources } from '@/server/db/schema';

export async function facilityMaintenance(facilityCode: string, today: string) {
  const db = await getDb();
  const plans = await db.select({ p: maintenancePlans, code: resources.code }).from(maintenancePlans).innerJoin(resources, eq(resources.id, maintenancePlans.resourceId))
    .where(and(eq(resources.facilityCode, facilityCode), eq(maintenancePlans.active, true))).orderBy(asc(resources.code), asc(maintenancePlans.label));
  const ids = plans.map((x) => x.p.id);
  const records = ids.length
    ? await db.select({ r: maintenanceRecords, label: maintenancePlans.label, code: resources.code }).from(maintenanceRecords)
      .innerJoin(maintenancePlans, eq(maintenancePlans.id, maintenanceRecords.planId)).innerJoin(resources, eq(resources.id, maintenancePlans.resourceId))
      .where(and(inArray(maintenanceRecords.planId, ids), gte(maintenanceRecords.doneOn, addDaysIso(today, -366)))).orderBy(desc(maintenanceRecords.doneOn), desc(maintenanceRecords.createdAt))
    : [];
  return {
    plans: plans.map(({ p, code }) => ({ ...p, resourceCode: code, dueOn: maintenanceDueOn(p), state: maintenanceState(p, today) })),
    records: records.map(({ r, label, code }) => ({ ...r, label, resourceCode: code })),
  };
}
