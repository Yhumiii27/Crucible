// Maintenance and calibration plans of the resources (CR-073, X-12). Pure: the due date is computed from the last intervention
// and the period (as a regulatory inspection, R-6), the state from the business date; a blocking plan past its due date forbids
// a slot that ends after it (checkBooking `maintenance_due`), a plan within MAINTENANCE_ALERT_DAYS of its due date is announced
// to the facility's managers.
import { addDaysIso } from '@/lib/dates';
import { inspectionDueOn } from './calendar';
import { isIsoDate } from './clock';

export const MAINTENANCE_KINDS = ['preventive', 'calibration'] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];
export const MAINTENANCE_KIND_LABEL: Record<MaintenanceKind, string> = { preventive: 'Preventive maintenance', calibration: 'Calibration' };

/** Days before the due date when the managers are told. */
export const MAINTENANCE_ALERT_DAYS = 14;

export type MaintenanceState = 'overdue' | 'soon' | 'ok';

export const maintenanceDueOn = (p: { lastOn: string; periodMonths: number }) => inspectionDueOn(p.lastOn, p.periodMonths);

export function maintenanceState(p: { lastOn: string; periodMonths: number }, today: string): MaintenanceState {
  const due = maintenanceDueOn(p);
  return due < today ? 'overdue' : due <= addDaysIso(today, MAINTENANCE_ALERT_DAYS) ? 'soon' : 'ok';
}

type Check<T> = { ok: true; value: T } | { ok: false; error: string };
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export interface PlanInput {
  kind: MaintenanceKind;
  label: string;
  periodMonths: number;
  lastOn: string;
  provider: string | null;
  blocking: boolean;
}

export function checkPlan(raw: Record<string, unknown>, today: string): Check<PlanInput> {
  const kind = String(raw.kind ?? '');
  if (!(MAINTENANCE_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'Choose preventive maintenance or calibration' };
  const label = text(raw.label, 120);
  if (label.length < 3) return { ok: false, error: 'Name the intervention' };
  const period = Number(raw.periodMonths);
  if (!Number.isInteger(period) || period < 1 || period > 120) return { ok: false, error: 'Period: 1 to 120 months' };
  const lastOn = String(raw.lastOn ?? '');
  if (!isIsoDate(lastOn) || lastOn > today) return { ok: false, error: 'Enter the date of the last intervention (today at the latest)' };
  return { ok: true, value: { kind: kind as MaintenanceKind, label, periodMonths: period, lastOn, provider: text(raw.provider, 120) || null, blocking: raw.blocking === 'on' || raw.blocking === 'true' } };
}

export interface RecordInput {
  doneOn: string;
  provider: string | null;
  note: string | null;
  codexRef: string | null;
}

export function checkRecord(raw: Record<string, unknown>, today: string): Check<RecordInput> {
  const doneOn = String(raw.doneOn ?? '');
  if (!isIsoDate(doneOn) || doneOn > today) return { ok: false, error: 'Enter the date of the intervention (today at the latest)' };
  return { ok: true, value: { doneOn, provider: text(raw.provider, 120) || null, note: text(raw.note, 500) || null, codexRef: text(raw.codexRef, 60) || null } };
}
