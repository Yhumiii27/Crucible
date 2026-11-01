// Maintenance and calibration of the resources (CR-073, X-12): a plan per resource and kind of intervention (preventive
// maintenance, calibration), with its period and provider; each intervention done is recorded and kept as recorded
// (append-only, database triggers), and moves the plan's last date. The due date is computed, never stored. Regulatory
// inspections stay those of R-6 (`inspections`, read from Vigie, D23).
import { boolean, date, index, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { MaintenanceKind } from '@/domain/maintenance';
import { crucible } from './_schema';
import { id, timestamps } from './_common';
import { resources } from './resources';

export const maintenancePlans = crucible.table('maintenance_plans', {
  id: id(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<MaintenanceKind>().notNull(),
  /** As typed, e.g. "Calibration of the load cell". */
  label: text('label').notNull(),
  periodMonths: smallint('period_months').notNull(),
  /** Last intervention done (the plan's start date until the first one). */
  lastOn: date('last_on', { mode: 'string' }).notNull(),
  /** Provider as typed (in-house team or company). */
  provider: text('provider'),
  /** Past its due date, the resource cannot be booked beyond it (hard constraint); otherwise only an alert. */
  blocking: boolean('blocking').notNull().default(true),
  active: boolean('active').notNull().default(true),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
}, (t) => [unique('maintenance_plans_resource_label_uq').on(t.resourceId, t.label)]);

export const maintenanceRecords = crucible.table('maintenance_records', {
  id: id(),
  planId: uuid('plan_id').notNull().references(() => maintenancePlans.id),
  doneOn: date('done_on', { mode: 'string' }).notNull(),
  provider: text('provider'),
  note: text('note'),
  /** Codex reference of the certificate or report (Crucible keeps the reference, never the file). */
  codexRef: text('codex_ref'),
  recordedByName: text('recorded_by_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('maintenance_records_plan_idx').on(t.planId, t.doneOn)]);
