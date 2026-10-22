// Projects' milestones, the test type catalogue and the test needs (docs/spec/02 §3, 03 §6; delivery 3). A need has two levels
// of maturity before the booking: a forecast (an envelope of half-days on a resource between two dates: "~15 days of PDE
// before March") and a request (a detailed test, its earliest date and its deadline). Pure; messages are EN source strings.
import { addWorkdaysIso, isIsoDate } from './clock';
import type { Check } from './resources';

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const CODE = /^[A-Z0-9][A-Z0-9-]{1,23}$/;

const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(text(v));
  return text(v) !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/** Criticality of a milestone (spec 02 §3): it ranks the deadlines of the tests (spec 03 §4–5). */
export const MILESTONE_CRITICALITIES = ['contractual', 'regulatory', 'internal'] as const;
export type MilestoneCriticality = (typeof MILESTONE_CRITICALITIES)[number];
export const MILESTONE_CRITICALITY_LABEL: Record<MilestoneCriticality, string> = { contractual: 'Contractual', regulatory: 'Regulatory', internal: 'Internal' };

/** `crucible`: entered in Crucible (S-1); `keystone`: read from Keystone once it publishes its milestones (S-2, K-2). */
export type MilestoneSource = 'crucible' | 'keystone';

export const NEED_LEVELS = ['forecast', 'request'] as const;
export type NeedLevel = (typeof NEED_LEVELS)[number];
export const NEED_LEVEL_LABEL: Record<NeedLevel, string> = { forecast: 'Forecast', request: 'Request' };

/** A need stays open until its author (or a planner) withdraws it; how much of it is booked is computed, never stored. */
export const NEED_STATUSES = ['open', 'withdrawn'] as const;
export type NeedStatus = (typeof NEED_STATUSES)[number];
export const NEED_STATUS_LABEL: Record<NeedStatus, string> = { open: 'Open', withdrawn: 'Withdrawn' };

/** Working days of notice asked for a request (F-5), unless a sharing agreement sets another for the partner (A-3). */
export const DEFAULT_NOTICE_WORKDAYS = 10;

/** Half-days of a need: from half a day to 200 days. */
export const MAX_NEED_HALF_DAYS = 400;

export interface MilestoneInput {
  label: string;
  dueOn: string;
  criticality: MilestoneCriticality;
}

export function checkMilestone(raw: Record<string, unknown>): Check<MilestoneInput> {
  const label = text(raw.label);
  if (label.length < 2 || label.length > 120) return { ok: false, error: 'Name the milestone' };
  const dueOn = text(raw.dueOn);
  if (!isIsoDate(dueOn)) return { ok: false, error: 'Enter the date of the milestone' };
  const criticality = text(raw.criticality) || 'internal';
  if (!(MILESTONE_CRITICALITIES as readonly string[]).includes(criticality)) return { ok: false, error: 'Choose the criticality of the milestone' };
  return { ok: true, value: { label, dueOn, criticality: criticality as MilestoneCriticality } };
}

export interface TestTypeInput {
  code: string;
  name: string;
  nominalResourceId: string | null;
  typicalHalfDays: number;
  skills: string | null;
  description: string | null;
}

/** A test type of the catalogue (D-3): its nominal resource, its usual length, the skills it asks (typed until Cursus, S-3). */
export function checkTestType(raw: Record<string, unknown>, ctx: { taken: ReadonlySet<string>; resources: ReadonlySet<string> }): Check<TestTypeInput> {
  const code = text(raw.code).toUpperCase();
  if (!CODE.test(code)) return { ok: false, error: 'The code has 2 to 24 letters, digits or dashes' };
  if (ctx.taken.has(code)) return { ok: false, error: 'This code is already used' };
  const name = text(raw.name);
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Name the test type' };
  const nominal = text(raw.nominalResourceId);
  if (nominal && !ctx.resources.has(nominal)) return { ok: false, error: 'Choose one of the resources' };
  const typicalHalfDays = int(raw.typicalHalfDays || '2', 1, MAX_NEED_HALF_DAYS);
  if (typicalHalfDays == null) return { ok: false, error: 'The usual length is a whole number of half-days' };
  return {
    ok: true,
    value: { code, name, nominalResourceId: nominal || null, typicalHalfDays, skills: text(raw.skills).slice(0, 300) || null, description: text(raw.description).slice(0, 500) || null },
  };
}

export interface NeedInput {
  level: NeedLevel;
  title: string;
  resourceId: string;
  halfDays: number;
  milestoneId: string | null;
  testTypeCode: string | null;
  earliestOn: string;
  deadlineOn: string;
  codexRef: string | null;
  note: string | null;
}

export interface NeedContext {
  /** Resources the need may target (facilities the viewer sees, shared with the partner's entity). */
  resources: ReadonlySet<string>;
  /** Milestones of the project, by id. */
  milestones: ReadonlyMap<string, { dueOn: string }>;
  testTypes: ReadonlySet<string>;
  today: string;
}

/**
 * A need (spec 03 §6): a level, a resource, a length in half-days, a window from the earliest date to the deadline. Without a
 * deadline, the deadline is the date of the milestone the need serves (backward planning from the milestone). Returns the
 * warnings the person should know: a deadline after the milestone it serves.
 */
export function checkNeed(raw: Record<string, unknown>, ctx: NeedContext): Check<NeedInput> & { warnings?: string[] } {
  const level = text(raw.level) || 'forecast';
  if (!(NEED_LEVELS as readonly string[]).includes(level)) return { ok: false, error: 'Choose forecast or request' };
  const title = text(raw.title);
  if (title.length < 3 || title.length > 200) return { ok: false, error: 'Describe the tests needed' };
  const resourceId = text(raw.resourceId);
  if (!ctx.resources.has(resourceId)) return { ok: false, error: 'Choose one of the resources' };
  const halfDays = int(raw.halfDays, 1, MAX_NEED_HALF_DAYS);
  if (halfDays == null) return { ok: false, error: 'The length is a whole number of half-days, from 1 to 400' };
  const milestoneId = text(raw.milestoneId) || null;
  const milestone = milestoneId ? ctx.milestones.get(milestoneId) : null;
  if (milestoneId && !milestone) return { ok: false, error: 'Choose a milestone of the project' };
  const testTypeCode = text(raw.testTypeCode).toUpperCase() || null;
  if (testTypeCode && !ctx.testTypes.has(testTypeCode)) return { ok: false, error: 'Choose a test type of the catalogue' };
  const earliestOn = text(raw.earliestOn) || ctx.today;
  if (!isIsoDate(earliestOn)) return { ok: false, error: 'Enter the earliest date' };
  const deadlineOn = text(raw.deadlineOn) || milestone?.dueOn || '';
  if (!isIsoDate(deadlineOn)) return { ok: false, error: 'Enter the deadline, or choose the milestone the tests serve' };
  if (deadlineOn < earliestOn) return { ok: false, error: 'The deadline comes before the earliest date' };
  if (deadlineOn < ctx.today) return { ok: false, error: 'The deadline has passed' };
  const warnings = milestone && deadlineOn > milestone.dueOn ? ['The deadline comes after the milestone'] : [];
  return {
    ok: true,
    value: {
      level: level as NeedLevel, title, resourceId, halfDays, milestoneId, testTypeCode, earliestOn, deadlineOn,
      codexRef: text(raw.codexRef).slice(0, 60) || null, note: text(raw.note).slice(0, 500) || null,
    },
    warnings,
  };
}

/** A request is late when it is made less than `notice` working days before the test (F-5): accepted, flagged and counted. */
export function isLateRequest(requestedOn: string, testOn: string, notice: number): boolean {
  return notice > 0 && testOn < addWorkdaysIso(requestedOn, notice);
}
