import 'server-only';
// Internal chargeback (CR-074, X-19): the rates of a facility (its tab "Rates") and the statement of a month for the facilities
// the viewer sees (or one), computed at each read from the bookings and the rates in force, never stored. A partner reads the
// lines of its own entity only; a project the viewer may not see is counted for its entity, never named (U-3).
import { asc, eq, inArray, isNull, and } from 'drizzle-orm';
import { chargeLine, chargeStatement, type ChargeRate } from '@/domain/charges';
import { monthRange } from '@/domain/report';
import { parisInstant, parisParts } from '@/lib/dates';
import { getDb } from '@/server/db/client';
import { chargeRates, resources } from '@/server/db/schema';
import { bookingsBetween } from '@/server/dal/resources';
import { visibleFacilities } from '@/server/dal/visibility';
import type { Viewer } from '@/server/viewer';

const BILLABLE = new Set(['confirmed', 'in_progress', 'done', 'no_show']);

/** The rates of a facility's resources, withdrawn ones included, newest first. */
export async function facilityRates(facilityCode: string) {
  const db = await getDb();
  const rows = await db.select({ r: chargeRates, resourceCode: resources.code }).from(chargeRates).innerJoin(resources, eq(resources.id, chargeRates.resourceId))
    .where(eq(resources.facilityCode, facilityCode)).orderBy(asc(resources.code), asc(chargeRates.validFrom));
  return rows.map((x) => ({
    id: x.r.id, resourceCode: x.resourceCode, entityCode: x.r.entityCode, centsPerHour: x.r.centsPerHour, validFrom: x.r.validFrom,
    createdByName: x.r.createdByName, withdrawn: !!x.r.withdrawnAt,
  }));
}

/** The chargeback statement of a month. */
export async function monthlyCharges(viewer: Viewer, month: string, facilityCode: string | null) {
  const { fromIso, toIso } = monthRange(month);
  const db = await getDb();
  const codes = (await visibleFacilities(viewer)).map((f) => f.code).filter((c) => !facilityCode || c === facilityCode);
  const res = codes.length ? await db.select({ id: resources.id }).from(resources).where(inArray(resources.facilityCode, codes)) : [];
  const ids = res.map((r) => r.id);
  const from = parisInstant(fromIso, '00:00');
  const to = parisInstant(toIso, '00:00');
  const [rows, rateRows] = await Promise.all([
    bookingsBetween(viewer, ids, from, to),
    ids.length ? db.select().from(chargeRates).where(and(inArray(chargeRates.resourceId, ids), isNull(chargeRates.withdrawnAt))) : [],
  ]);
  const rates: ChargeRate[] = rateRows.map((r) => ({ id: r.id, resourceId: r.resourceId, entityCode: r.entityCode, centsPerHour: r.centsPerHour, validFrom: r.validFrom, createdAt: r.createdAt.getTime() }));
  const own = viewer.role === 'partner' ? viewer.assignments.filter((a) => a.role === 'partner' && a.scopeRef).map((a) => a.scopeRef!) : null;
  const lines = rows
    .filter((b) => BILLABLE.has(b.status) && b.start >= from.getTime() && b.start < to.getTime() && (!own || own.includes(b.entityCode)))
    .map((b) => chargeLine({ ...b, day: parisParts(new Date(b.start)).iso }, rates));
  return { month, fromIso, toIso, ...chargeStatement(lines), facilities: codes };
}
