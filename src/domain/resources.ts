// Test resources vocabulary and input checks (docs/spec/02 §1–3): resources and their kinds, unavailabilities, periodic
// inspections, exclusion rules, entity agreements, booking statuses. Pure; messages are EN source strings.
import { isIsoDate } from './clock';
import { isHhmm } from './calendar';

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const CODE = /^[A-Z0-9][A-Z0-9-]{1,23}$/;

export const RESOURCE_KINDS = ['zone', 'bench', 'machine', 'room', 'equipment'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = { zone: 'Zone', bench: 'Test bench', machine: 'Machine', room: 'Room', equipment: 'Equipment' };

export const RESOURCE_STATUSES = ['in_service', 'maintenance', 'out_of_service', 'retired'] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];
export const RESOURCE_STATUS_LABEL: Record<ResourceStatus, string> = { in_service: 'In service', maintenance: 'In maintenance', out_of_service: 'Out of service', retired: 'Retired' };

/** Booking grain (F-1): half-days by default, hours for the resources that need it. */
export const GRANULARITIES = ['half_day', 'hour'] as const;
export type Granularity = (typeof GRANULARITIES)[number];
export const GRANULARITY_LABEL: Record<Granularity, string> = { half_day: 'Half-day', hour: 'Hour' };

export const UNAVAILABILITY_KINDS = ['maintenance', 'inspection', 'breakdown', 'works', 'other'] as const;
export type UnavailabilityKind = (typeof UNAVAILABILITY_KINDS)[number];
export const UNAVAILABILITY_KIND_LABEL: Record<UnavailabilityKind, string> = {
  maintenance: 'Maintenance', inspection: 'Inspection', breakdown: 'Breakdown', works: 'Works', other: 'Other',
};

export const RULE_REASONS = ['safety', 'shared_staff', 'energy', 'nuisance', 'other'] as const;
export type RuleReason = (typeof RULE_REASONS)[number];
export const RULE_REASON_LABEL: Record<RuleReason, string> = {
  safety: 'Safety', shared_staff: 'Shared staff', energy: 'Energy', nuisance: 'Nuisance', other: 'Other',
};

/** An exclusion rule applies once the safety officer validates it (R-3); a retired rule no longer applies. */
export const RULE_STATUSES = ['proposed', 'validated', 'retired'] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];
export const RULE_STATUS_LABEL: Record<RuleStatus, string> = { proposed: 'Awaiting validation', validated: 'Validated', retired: 'Retired' };

export const BOOKING_STATUSES = ['requested', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: 'Requested', confirmed: 'Confirmed', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled', no_show: 'Not held',
};

/** Statuses that hold the resource (capacity, exclusions, occupation). A request does not hold it yet. */
export const HOLDING: readonly BookingStatus[] = ['confirmed', 'in_progress', 'done'];

export interface ResourceInput {
  code: string;
  facilityCode: string;
  name: string;
  kind: ResourceKind;
  granularity: Granularity;
  capacity: number;
  setupMinutes: number;
  teardownMinutes: number;
  description: string | null;
}

const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(text(v) || (typeof v === 'number' ? v : NaN));
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/** A resource of a facility the viewer manages. */
export function checkResource(raw: Record<string, unknown>, ctx: { taken: ReadonlySet<string>; facilities: ReadonlySet<string> }): Check<ResourceInput> {
  const code = text(raw.code).toUpperCase();
  if (!CODE.test(code)) return { ok: false, error: 'The code has 2 to 24 letters, digits or dashes' };
  if (ctx.taken.has(code)) return { ok: false, error: 'This code is already used' };
  const facilityCode = text(raw.facilityCode).toUpperCase();
  if (!ctx.facilities.has(facilityCode)) return { ok: false, error: 'Choose one of your facilities' };
  const name = text(raw.name);
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Enter the resource’s name' };
  const kind = text(raw.kind);
  if (!(RESOURCE_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'Choose a kind of resource' };
  const granularity = text(raw.granularity) || 'half_day';
  if (!(GRANULARITIES as readonly string[]).includes(granularity)) return { ok: false, error: 'Choose half-days or hours' };
  const capacity = int(raw.capacity || '1', 1, 20);
  if (capacity == null) return { ok: false, error: 'The capacity is a whole number from 1 to 20' };
  const setupMinutes = int(raw.setupMinutes || '0', 0, 1440);
  const teardownMinutes = int(raw.teardownMinutes || '0', 0, 1440);
  if (setupMinutes == null || teardownMinutes == null) return { ok: false, error: 'Preparation times are whole minutes from 0 to 1440' };
  return {
    ok: true,
    value: { code, facilityCode, name, kind: kind as ResourceKind, granularity: granularity as Granularity, capacity, setupMinutes, teardownMinutes, description: text(raw.description).slice(0, 500) || null },
  };
}

/** An unavailability: a label, a kind and dates (a whole-day span, inclusive). */
export function checkUnavailability(raw: Record<string, unknown>): Check<{ kind: UnavailabilityKind; label: string; fromOn: string; toOn: string }> {
  const kind = text(raw.kind);
  if (!(UNAVAILABILITY_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'Choose a kind of unavailability' };
  const label = text(raw.label);
  if (label.length < 2 || label.length > 120) return { ok: false, error: 'Describe the unavailability' };
  const fromOn = text(raw.fromOn);
  const toOn = text(raw.toOn) || fromOn;
  if (!isIsoDate(fromOn) || !isIsoDate(toOn) || toOn < fromOn) return { ok: false, error: 'Enter the first and last days' };
  return { ok: true, value: { kind: kind as UnavailabilityKind, label, fromOn, toOn } };
}

/** A periodic inspection (R-6, S-4): what is checked, the period, the date of the last one. */
export function checkInspection(raw: Record<string, unknown>, today: string): Check<{ label: string; periodMonths: number; lastOn: string; codexRef: string | null }> {
  const label = text(raw.label);
  if (label.length < 2 || label.length > 120) return { ok: false, error: 'Name the inspection' };
  const periodMonths = int(raw.periodMonths, 1, 120);
  if (periodMonths == null) return { ok: false, error: 'The period is a whole number of months from 1 to 120' };
  const lastOn = text(raw.lastOn);
  if (!isIsoDate(lastOn) || lastOn > today) return { ok: false, error: 'Enter the date of the last inspection (not in the future)' };
  return { ok: true, value: { label, periodMonths, lastOn, codexRef: text(raw.codexRef).slice(0, 60) || null } };
}

export interface RuleInput {
  code: string;
  label: string;
  maxActive: number;
  reason: RuleReason;
  motive: string;
  codexRef: string | null;
  resourceIds: string[];
}

/** An exclusion rule (R-2): at least two resources, of which at most `maxActive` work at the same time. */
export function checkExclusionRule(raw: Record<string, unknown>, ctx: { taken: ReadonlySet<string>; resources: ReadonlySet<string> }): Check<RuleInput> {
  const code = text(raw.code).toUpperCase();
  if (!CODE.test(code)) return { ok: false, error: 'The code has 2 to 24 letters, digits or dashes' };
  if (ctx.taken.has(code)) return { ok: false, error: 'This code is already used' };
  const label = text(raw.label);
  if (label.length < 2 || label.length > 120) return { ok: false, error: 'Name the rule' };
  const ids = Array.isArray(raw.resourceIds) ? raw.resourceIds.map(text) : [];
  const resourceIds = [...new Set(ids.filter(Boolean))].sort();
  if (resourceIds.length < 2 || resourceIds.some((r) => !ctx.resources.has(r))) return { ok: false, error: 'Choose at least two resources' };
  const maxActive = int(raw.maxActive || '1', 1, resourceIds.length - 1);
  if (maxActive == null) return { ok: false, error: 'At most fewer resources than the rule names can work at the same time' };
  const reason = text(raw.reason) || 'safety';
  if (!(RULE_REASONS as readonly string[]).includes(reason)) return { ok: false, error: 'Choose the reason of the rule' };
  const motive = text(raw.motive);
  if (motive.length < 5 || motive.length > 1000) return { ok: false, error: 'Explain why these resources cannot work together' };
  return { ok: true, value: { code, label, maxActive, reason: reason as RuleReason, motive, codexRef: text(raw.codexRef).slice(0, 60) || null, resourceIds } };
}

/** A sharing agreement (A-3): a quota of days per month on a facility, the notice asked, a note. */
export function checkAgreement(raw: Record<string, unknown>, ctx: { facilities: ReadonlySet<string>; partners: ReadonlySet<string> }): Check<{ facilityCode: string; entityCode: string; quotaDaysPerMonth: number | null; noticeWorkdays: number; note: string | null }> {
  const facilityCode = text(raw.facilityCode).toUpperCase();
  if (!ctx.facilities.has(facilityCode)) return { ok: false, error: 'Choose a facility' };
  const entityCode = text(raw.entityCode).toUpperCase();
  if (!ctx.partners.has(entityCode)) return { ok: false, error: 'Choose a partner entity the facility is shared with' };
  const q = text(raw.quotaDaysPerMonth);
  const quotaDaysPerMonth = q ? int(q, 0, 31) : null;
  if (q && quotaDaysPerMonth == null) return { ok: false, error: 'The quota is a whole number of days from 0 to 31' };
  const noticeWorkdays = int(raw.noticeWorkdays || '10', 0, 60);
  if (noticeWorkdays == null) return { ok: false, error: 'The notice is a whole number of working days from 0 to 60' };
  return { ok: true, value: { facilityCode, entityCode, quotaDaysPerMonth, noticeWorkdays, note: text(raw.note).slice(0, 500) || null } };
}

export interface SlotInput {
  fromOn: string;
  toOn: string;
  /** Half-day resources: `am` or `pm` of the first and last days. */
  fromHalf: 'am' | 'pm';
  toHalf: 'am' | 'pm';
  /** Hour resources: wall-clock times of the first and last days. */
  fromTime: string;
  toTime: string;
}

/** The dates and halves (or times) of a slot as typed. */
export function checkSlotInput(raw: Record<string, unknown>, granularity: Granularity): Check<SlotInput> {
  const fromOn = text(raw.fromOn);
  const toOn = text(raw.toOn) || fromOn;
  if (!isIsoDate(fromOn) || !isIsoDate(toOn) || toOn < fromOn) return { ok: false, error: 'Enter the first and last days' };
  const half = (v: unknown, d: 'am' | 'pm') => (text(v) === 'am' || text(v) === 'pm' ? (text(v) as 'am' | 'pm') : d);
  const fromHalf = half(raw.fromHalf, 'am');
  const toHalf = half(raw.toHalf, 'pm');
  const fromTime = text(raw.fromTime);
  const toTime = text(raw.toTime);
  if (granularity === 'hour') {
    if (!isHhmm(fromTime) || !isHhmm(toTime)) return { ok: false, error: 'Enter the start and end times' };
  } else if (fromOn === toOn && fromHalf === 'pm' && toHalf === 'am') return { ok: false, error: 'The end comes before the start' };
  return { ok: true, value: { fromOn, toOn, fromHalf, toHalf, fromTime, toTime } };
}

/** Purpose of a test as typed: 3 to 200 characters. */
export function checkTitle(raw: unknown): Check<string> {
  const title = text(raw);
  return title.length < 3 || title.length > 200 ? { ok: false, error: 'Describe the test' } : { ok: true, value: title };
}
