import 'server-only';
// Notification jobs (F-8, A-6; delivery 5), run by the worker: the reminders of the arbitrations past their due date — to the
// decider, then also to the R&D director two working days later — once a day per conflict, and the weekly recap of each
// requester's tests of the next two weeks; the maintenance and calibration plans due within MAINTENANCE_ALERT_DAYS (CR-073).
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { addWorkdaysIso } from '@/domain/clock';
import { addDaysIso, parisInstant } from '@/lib/dates';
import { maintenanceDueOn, MAINTENANCE_ALERT_DAYS } from '@/domain/maintenance';
import { bookings, conflicts, maintenancePlans, notifications, resources } from '@/server/db/schema';
import type { DB } from '@/server/db/types';
import { notify, usersWithRole } from './index';

/** Reminds the deciders of the open conflicts past their due date (A-6: never applied tacitly). Once a day per conflict. */
export async function remindOverdueArbitrations(db: DB, today: string, now = new Date()): Promise<number> {
  const late = await db.select().from(conflicts).where(and(inArray(conflicts.status, ['open', 'vetoed']), lt(conflicts.dueOn, today)));
  let n = 0;
  for (const c of late) {
    const title = `Arbitration overdue · ${c.ref} · ${c.dueOn}`;
    const already = await db.select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.title, title), gte(notifications.createdAt, parisInstant(today, '00:00')))).limit(1);
    if (already.length) continue;
    const escalate = addWorkdaysIso(c.dueOn, 2) <= today;
    const to = [...await usersWithRole(db, [c.decider]), ...(escalate ? await usersWithRole(db, ['rd_director']) : [])];
    n += await notify(db, to, { kind: 'conflict_overdue', title, href: '/conflicts' }, { at: now });
  }
  return n;
}

/** The weekly recap (F-8): each requester's confirmed tests of the next two weeks. */
export async function weeklyRecap(db: DB, today: string, now = new Date()): Promise<number> {
  const rows = await db.select({ userId: bookings.requestedByUserId, ref: bookings.ref }).from(bookings)
    .where(and(eq(bookings.status, 'confirmed'), gte(bookings.startsAt, parisInstant(today, '00:00')), lt(bookings.startsAt, parisInstant(addDaysIso(today, 14), '00:00'))))
    .orderBy(bookings.startsAt);
  const by = new Map<string, string[]>();
  for (const r of rows) if (r.userId) by.set(r.userId, [...(by.get(r.userId) ?? []), r.ref]);
  let n = 0;
  for (const [userId, refs] of by) n += await notify(db, [userId], { kind: 'recap', title: `Your tests of the next two weeks · ${refs.join(', ')}`, href: '/my/needs' }, { at: now });
  return n;
}

/**
 * Tells the coordinators and managers of the facility of each maintenance or calibration plan due within MAINTENANCE_ALERT_DAYS
 * or past its due date (CR-073), once per plan and due date (a new intervention gives a new due date, so a new notice).
 */
export async function remindMaintenance(db: DB, today: string, now = new Date()): Promise<number> {
  const plans = await db.select({ p: maintenancePlans, code: resources.code, facilityCode: resources.facilityCode }).from(maintenancePlans)
    .innerJoin(resources, eq(resources.id, maintenancePlans.resourceId)).where(eq(maintenancePlans.active, true));
  const limit = addDaysIso(today, MAINTENANCE_ALERT_DAYS);
  let n = 0;
  for (const row of plans) {
    const due = maintenanceDueOn(row.p);
    if (due > limit) continue;
    const title = `Maintenance or calibration due · ${row.code} · ${row.p.label} · ${due}`;
    const already = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.title, title)).limit(1);
    if (already.length) continue;
    const to = await usersWithRole(db, ['facility_manager', 'coordinator'], [row.facilityCode]);
    n += await notify(db, to, { kind: 'maintenance_due', title, href: `/facilities/${encodeURIComponent(row.facilityCode)}?tab=maintenance` }, { at: now });
  }
  return n;
}
