// The pilot (docs/PLAN.md "Pilote", decisions P-3, X-2, F-9; docs/PILOTE.md): Crucible becomes the reference of the bookings
// of the pilot facilities from a start date, for a number of weeks; the reference measure is the period before the start
// (history imported, F-9), compared with the pilot period so far (X-2). Settings checked here, periods and comparisons
// computed, never stored. Pure.
import { addDaysIso, daysBetweenIso } from '@/lib/dates';
import { isIsoDate } from './clock';
import type { Check } from './admin';

export interface PilotSettings {
  /** First day Crucible is the reference of the bookings. */
  startOn: string;
  /** Length of the pilot (the plan says 4 weeks of real use). */
  weeks: number;
  /** Facilities in the pilot (P-3). */
  facilities: string[];
  /** Weeks before the start measured as the reference (X-2: the history imported). */
  baselineWeeks: number;
}

export const PILOT_DEFAULTS = { weeks: 4, baselineWeeks: 13 } as const;
export const PILOT_SETTING_KEY = 'crucible.pilot';

/** Not set yet, set and not started, running (its week), ended. */
export type PilotStatus = { kind: 'not_set' } | { kind: 'planned'; daysLeft: number } | { kind: 'running'; week: number; of: number } | { kind: 'ended'; endOn: string };

export const endOfPilot = (s: PilotSettings) => addDaysIso(s.startOn, 7 * s.weeks);

export function pilotStatus(s: PilotSettings | null, today: string): PilotStatus {
  if (!s) return { kind: 'not_set' };
  if (today < s.startOn) return { kind: 'planned', daysLeft: daysBetweenIso(today, s.startOn) };
  const end = endOfPilot(s);
  if (today >= end) return { kind: 'ended', endOn: end };
  return { kind: 'running', week: Math.floor(daysBetweenIso(s.startOn, today) / 7) + 1, of: s.weeks };
}

/**
 * The two periods compared (X-2), as [from, to) days: the reference ends the day before the start; the pilot runs from the start
 * to today (included) or its end. Null for the pilot before it starts.
 */
export function pilotPeriods(s: PilotSettings, today: string): { baseline: { from: string; to: string }; pilot: { from: string; to: string } | null } {
  const baseline = { from: addDaysIso(s.startOn, -7 * s.baselineWeeks), to: s.startOn };
  if (today < s.startOn) return { baseline, pilot: null };
  const end = endOfPilot(s);
  const to = addDaysIso(today, 1) < end ? addDaysIso(today, 1) : end;
  return { baseline, pilot: { from: s.startOn, to } };
}

/** "+4.2 pts", "−1 pt", "=": the change of a rate in points. */
export function pointsDelta(before: number | null, after: number | null): number | null {
  return before == null || after == null ? null : Math.round((after - before) * 10) / 10;
}

const int = (v: unknown, min: number, max: number) => {
  const n = Number(String(v ?? '').trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** The pilot as set by the R&D director: a start date, a length, the facilities (at least one, among the active ones). */
export function checkPilotSettings(raw: Record<string, unknown>, ctx: { facilities: ReadonlySet<string>; today: string }): Check<PilotSettings> {
  const startOn = String(raw.startOn ?? '').trim();
  if (!isIsoDate(startOn)) return { ok: false, error: 'Enter the first day of the pilot' };
  if (startOn < addDaysIso(ctx.today, -7 * 26)) return { ok: false, error: 'The pilot starts more than 26 weeks ago' };
  const weeks = int(raw.weeks ?? PILOT_DEFAULTS.weeks, 1, 26);
  if (weeks == null) return { ok: false, error: 'The pilot lasts 1 to 26 weeks' };
  const baselineWeeks = int(raw.baselineWeeks ?? PILOT_DEFAULTS.baselineWeeks, 1, 52);
  if (baselineWeeks == null) return { ok: false, error: 'The reference covers 1 to 52 weeks' };
  const list = Array.isArray(raw.facilities) ? raw.facilities : String(raw.facilities ?? '').split(',');
  const facilities = [...new Set(list.map((x) => String(x).trim().toUpperCase()).filter(Boolean))].sort();
  if (!facilities.length) return { ok: false, error: 'Choose the facilities of the pilot' };
  if (facilities.some((f) => !ctx.facilities.has(f))) return { ok: false, error: 'Choose active facilities' };
  return { ok: true, value: { startOn, weeks, facilities, baselineWeeks } };
}

/** A stored value read back (null when absent or malformed). */
export function parsePilotSettings(v: unknown): PilotSettings | null {
  if (!v || typeof v !== 'object') return null;
  const x = v as Record<string, unknown>;
  if (typeof x.startOn !== 'string' || !isIsoDate(x.startOn) || !Array.isArray(x.facilities)) return null;
  const weeks = typeof x.weeks === 'number' ? x.weeks : PILOT_DEFAULTS.weeks;
  const baselineWeeks = typeof x.baselineWeeks === 'number' ? x.baselineWeeks : PILOT_DEFAULTS.baselineWeeks;
  return { startOn: x.startOn, weeks, baselineWeeks, facilities: x.facilities.filter((f): f is string => typeof f === 'string') };
}

/** What must be in place before the start (docs/PILOTE.md §2), each with the screen that settles it. */
export type ReadinessKey =
  | 'resources' | 'rules' | 'inspections' | 'managers' | 'technicians' | 'coordinator' | 'safety'
  | 'people' | 'projects' | 'history' | 'auth';

export const READINESS_LABEL: Record<ReadinessKey, string> = {
  resources: 'Resources of every pilot facility',
  rules: 'Exclusion rules validated by the safety officer (R-2, R-3)',
  inspections: 'Regulatory inspections recorded (R-6, D-10)',
  managers: 'A facility manager for every pilot facility',
  technicians: 'Technicians for every pilot facility',
  coordinator: 'A test resources coordinator (U-2)',
  safety: 'A safety officer',
  people: 'People and their skills (F-7, D-6)',
  projects: 'Projects with their milestones (S-1, D-5)',
  history: 'History imported for the reference period (F-9, D-8)',
  auth: 'Microsoft Entra sign-in (real users)',
};

export interface ReadinessFacts {
  facilities: readonly { code: string; resources: number; managers: number; technicians: number; rules: number; inspections: number }[];
  coordinators: number;
  safetyOfficers: number;
  peopleWithSkills: number;
  projectsWithMilestones: number;
  historyBookings: number;
  entra: boolean;
}

export interface ReadinessItem {
  key: ReadinessKey;
  ok: boolean;
  /** Facilities still missing it (codes), when per facility. */
  missing: string[];
  /** A count shown as is. */
  count: number | null;
}

/**
 * The checklist of the start. A rule is expected where a facility holds several resources that cannot run together (the PDE);
 * Crucible cannot know that by itself, so "rules" only asks for one validated rule in the pilot overall, the safety officer
 * confirming there is none elsewhere.
 */
export function readiness(f: ReadinessFacts): ReadinessItem[] {
  const per = (key: ReadinessKey, missing: string[]): ReadinessItem => ({ key, ok: !missing.length, missing, count: null });
  const count = (key: ReadinessKey, n: number): ReadinessItem => ({ key, ok: n > 0, missing: [], count: n });
  return [
    per('resources', f.facilities.filter((x) => x.resources === 0).map((x) => x.code)),
    count('rules', f.facilities.reduce((s, x) => s + x.rules, 0)),
    per('inspections', f.facilities.filter((x) => x.inspections === 0).map((x) => x.code)),
    per('managers', f.facilities.filter((x) => x.managers === 0).map((x) => x.code)),
    per('technicians', f.facilities.filter((x) => x.technicians === 0).map((x) => x.code)),
    count('coordinator', f.coordinators),
    count('safety', f.safetyOfficers),
    count('people', f.peopleWithSkills),
    count('projects', f.projectsWithMilestones),
    count('history', f.historyBookings),
    { key: 'auth', ok: f.entra, missing: [], count: null },
  ];
}
