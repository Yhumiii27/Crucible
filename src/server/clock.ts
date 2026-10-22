import 'server-only';
// Business clock of this server process. CRUCIBLE_CLOCK decides: unset or "real" = the real date (Europe/Paris); a pinned
// YYYY-MM-DD for demonstrations, reproducible screenshots and the tests (vitest and the end-to-end runner pin the demo data
// set's date, DEMO_TODAY_ISO). Copied from Keystone (R-013).
//
// Server code asks `businessToday()` / `businessNow()` and passes `today` to the pure rules (src/domain/clock.ts). The optional
// database handle is kept for callers inside a transaction.
import { REAL_CLOCK, businessNowOf, todayOf, type ClockSetting } from '@/domain/clock';
import { getConfig } from '@/server/config';
import type { DB, Tx } from '@/server/db/types';

const g = globalThis as unknown as { __crucibleClockOverride?: ClockSetting | null };

/** The clock setting: test override, then CRUCIBLE_CLOCK, else the real clock. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function clockSetting(_q?: DB | Tx): Promise<ClockSetting> {
  return g.__crucibleClockOverride ?? getConfig().clock ?? REAL_CLOCK;
}

/** Business date (ISO, Europe/Paris): lateness, due dates, dates stamped on writes, form defaults. */
export async function businessToday(q?: DB | Tx): Promise<string> {
  return todayOf(await clockSetting(q));
}

/** Business instant (the real instant, or the pinned date at the real time of day). */
export async function businessNow(q?: DB | Tx): Promise<Date> {
  return businessNowOf(await clockSetting(q));
}

/** Tests: pins (or with null, releases) the clock of this process. */
export function setClockForTests(setting: ClockSetting | null): void {
  g.__crucibleClockOverride = setting;
}
