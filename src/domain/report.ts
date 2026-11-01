// The monthly report (CR-077, X-16): the month of a report and its rows, from the utilisation computed for the dashboard
// (src/domain/utilisation.ts). Pure: no import of the server.
import { rateOf, sumUsage, type ResourceUsage } from './utilisation';

/** "2026-10": a month typed in the address, else null. */
export function parseMonth(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

/** First day of the month and first day of the next one (ISO dates). */
export function monthRange(month: string): { fromIso: string; toIso: string } {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { fromIso: `${month}-01`, toIso: `${next}-01` };
}

/** The month before or after. */
export function shiftMonth(month: string, by: -1 | 1): string {
  const [y, m] = month.split('-').map(Number);
  const k = y * 12 + (m - 1) + by;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
}

export interface ReportLine {
  code: string;
  facilityCode: string;
  netOpenHours: number;
  bookedHours: number;
  realisedHours: number;
  blockedHours: number;
  noShows: number;
  /** Rates in %, null without open hours. */
  bookedRate: number | null;
  realisedRate: number | null;
  blockedRate: number | null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function reportLine(code: string, facilityCode: string, u: ResourceUsage): ReportLine {
  return {
    code, facilityCode,
    netOpenHours: round1(u.netOpenHours), bookedHours: round1(u.bookedHours), realisedHours: round1(u.realisedWithPrepHours), blockedHours: round1(u.blockedHours),
    noShows: u.noShows,
    bookedRate: rateOf(u.bookedHours, u.netOpenHours), realisedRate: rateOf(u.realisedWithPrepHours, u.netOpenHours), blockedRate: rateOf(u.blockedHours, u.netOpenHours),
  };
}

/** The total line of a facility (or of the whole report). */
export const totalLine = (code: string, facilityCode: string, usages: readonly ResourceUsage[]) => reportLine(code, facilityCode, sumUsage([...usages]));
