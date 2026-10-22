// Business clock: the one source of "today" and "now" for business rules — lateness, due dates, the dates stamped on writes,
// review cadence, gate deadlines. Pure: no environment, no database. The server resolves the setting (src/server/clock.ts)
// and passes `today` down; client components receive it from the layout (ClockProvider). Copied from Keystone (R-013).
//
// - `real`: the wall clock in Europe/Paris.
// - `fixed`: the date is pinned, the time of day stays real — demonstrations, tests and reproducible screenshots.
//
// Technical timestamps (audit rows, job runs, sync times) are real instants (`new Date()`), not this clock.
import { addDaysIso, dowOfIso, parisInstant, parisParts } from '@/lib/dates';

/** Business date of the demonstration data set (Thu 22 Oct 2026). Seeds and tests use it, never the clock. */
export const DEMO_TODAY_ISO = '2026-10-22';

export type ClockSetting = { kind: 'real' } | { kind: 'fixed'; iso: string };

export const REAL_CLOCK: ClockSetting = { kind: 'real' };
export const DEMO_CLOCK: ClockSetting = { kind: 'fixed', iso: DEMO_TODAY_ISO };

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** CRUCIBLE_CLOCK value → setting: "real", or a pinned YYYY-MM-DD; null when invalid. */
export function parseClockSetting(raw: string): ClockSetting | null {
  const v = raw.trim().toLowerCase();
  if (v === 'real') return REAL_CLOCK;
  return isIsoDate(v) ? { kind: 'fixed', iso: v } : null;
}

/** Business date (ISO, Europe/Paris) of the clock at the real instant `at`. */
export function todayOf(setting: ClockSetting, at: Date = new Date()): string {
  return setting.kind === 'fixed' ? setting.iso : parisParts(at).iso;
}

/** Business instant: the real instant, or — on a pinned date — that date at the real Paris time of day. */
export function businessNowOf(setting: ClockSetting, at: Date = new Date()): Date {
  if (setting.kind === 'real') return at;
  const p = parisParts(at);
  return parisInstant(setting.iso, `${p.hh}:${p.mm}`);
}

/** Last working day on or before the date (a weekend date → its Friday). */
export function lastWorkdayOf(iso: string): string {
  const dow = dowOfIso(iso);
  return dow === 6 ? addDaysIso(iso, -1) : dow === 0 ? addDaysIso(iso, -2) : iso;
}

/** The date `n` working days (Monday–Friday) after `iso`; public holidays are not counted yet. */
export function addWorkdaysIso(iso: string, n: number): string {
  let d = iso;
  let left = n;
  while (left > 0) {
    d = addDaysIso(d, 1);
    const dow = dowOfIso(d);
    if (dow !== 0 && dow !== 6) left--;
  }
  return d;
}
