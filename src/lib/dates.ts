// Calendar helpers on ISO dates (YYYY-MM-DD) and Paris wall-clock time. Pure; copied from Keystone's src/server/db/codes.ts
// (docs/SOCLE.md). Business dates are Europe/Paris dates.
const DAY_MS = 86_400_000;

const utcOf = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoOfUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The date `days` calendar days after `iso` (negative: before). */
export const addDaysIso = (iso: string, days: number) => isoOfUtc(utcOf(iso) + days * DAY_MS);
/** Calendar days from `a` to `b`. */
export const daysBetweenIso = (a: string, b: string) => Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
/** Day of week (0 = Sunday). */
export const dowOfIso = (iso: string) => new Date(utcOf(iso)).getUTCDay();

/** Paris date and time of an instant. */
export function parisParts(at: Date): { iso: string; hh: string; mm: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { iso: `${p.year}-${p.month}-${p.day}`, hh: p.hour, mm: p.minute };
}

/** Instant of a Paris wall-clock time: ('2026-09-25', '09:12') → 2026-09-25T07:12:00Z (CEST). */
export function parisInstant(iso: string, hhmm: string): Date {
  const guess = new Date(`${iso}T${hhmm}:00Z`);
  const p = parisParts(guess);
  const shown = Date.UTC(+p.iso.slice(0, 4), +p.iso.slice(5, 7) - 1, +p.iso.slice(8, 10), +p.hh, +p.mm);
  return new Date(guess.getTime() - (shown - guess.getTime()));
}
