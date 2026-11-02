// Internal chargeback (CR-074, X-19): dated rates per resource, for every entity or for one (laboratoire 67 shared with EPC
// France), and the statement of a month per entity and project — booked hours, realised hours, billed hours and amount, computed
// at each read, never stored. Billed: a test done for its realised time (actual start to actual end; the booked slot when not
// recorded), a booking not held for its booked slot; nothing for a booking cancelled, requested or still to come. A booking
// belongs to the month of its start. Amounts in euro cents. Pure: no import.

export interface ChargeRate {
  id: string;
  resourceId: string;
  /** Null: the rate of every entity without its own. */
  entityCode: string | null;
  centsPerHour: number;
  /** First day (YYYY-MM-DD) the rate applies. */
  validFrom: string;
  createdAt: number;
}

/**
 * The rate of a booking: among the rates of the resource valid on its day, the entity's own one (latest first), else the rate of
 * every entity; null when there is none.
 */
export function rateFor(rates: readonly ChargeRate[], resourceId: string, entityCode: string, day: string): ChargeRate | null {
  const valid = rates.filter((r) => r.resourceId === resourceId && r.validFrom <= day)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.createdAt - a.createdAt);
  return valid.find((r) => r.entityCode === entityCode) ?? valid.find((r) => r.entityCode == null) ?? null;
}

export interface ChargeBooking {
  id: string;
  ref: string;
  resourceId: string;
  resourceCode: string;
  facilityCode: string;
  entityCode: string;
  /** Null when the viewer may not see the project (U-3): counted for its entity, under "confidential". */
  projectCode: string | null;
  confidential: boolean;
  status: string;
  start: number;
  end: number;
  actualStart: number | null;
  actualEnd: number | null;
  /** Paris day of the start (YYYY-MM-DD). */
  day: string;
}

const HOUR = 3_600_000;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Hours billed for a booking: realised for a test done, booked for one not held, else 0. */
export function billedHours(b: Pick<ChargeBooking, 'status' | 'start' | 'end' | 'actualStart' | 'actualEnd'>): number {
  if (b.status === 'done') {
    const ms = b.actualStart != null && b.actualEnd != null && b.actualEnd > b.actualStart ? b.actualEnd - b.actualStart : b.end - b.start;
    return round2(ms / HOUR);
  }
  if (b.status === 'no_show') return round2((b.end - b.start) / HOUR);
  return 0;
}

export interface ChargeLine {
  bookingId: string;
  ref: string;
  resourceCode: string;
  facilityCode: string;
  entityCode: string;
  projectCode: string | null;
  confidential: boolean;
  status: string;
  day: string;
  bookedHours: number;
  realisedHours: number;
  billedHours: number;
  /** Null when no rate applies. */
  centsPerHour: number | null;
  amountCents: number;
}

export function chargeLine(b: ChargeBooking, rates: readonly ChargeRate[]): ChargeLine {
  const rate = rateFor(rates, b.resourceId, b.entityCode, b.day);
  const billed = billedHours(b);
  const realised = b.actualStart != null && b.actualEnd != null && b.actualEnd > b.actualStart ? round2((b.actualEnd - b.actualStart) / HOUR) : 0;
  return {
    bookingId: b.id, ref: b.ref, resourceCode: b.resourceCode, facilityCode: b.facilityCode, entityCode: b.entityCode, projectCode: b.projectCode,
    confidential: b.confidential, status: b.status, day: b.day,
    bookedHours: round2((b.end - b.start) / HOUR), realisedHours: realised, billedHours: billed,
    centsPerHour: rate?.centsPerHour ?? null,
    amountCents: rate ? Math.round(billed * rate.centsPerHour) : 0,
  };
}

export interface ChargeGroup {
  entityCode: string;
  /** Null: the projects the viewer may not see, together. */
  projectCode: string | null;
  lines: ChargeLine[];
  bookedHours: number;
  billedHours: number;
  amountCents: number;
  /** Lines billed without a rate (to set before sending the statement). */
  unrated: number;
}

/** The statement: one group per entity and project (the hidden projects of an entity together), sorted. */
export function chargeStatement(lines: readonly ChargeLine[]): { groups: ChargeGroup[]; amountCents: number; unrated: number } {
  const map = new Map<string, ChargeGroup>();
  for (const l of lines) {
    const key = `${l.entityCode}|${l.projectCode ?? ''}`;
    let g = map.get(key);
    if (!g) map.set(key, (g = { entityCode: l.entityCode, projectCode: l.projectCode, lines: [], bookedHours: 0, billedHours: 0, amountCents: 0, unrated: 0 }));
    g.lines.push(l);
    g.bookedHours = round2(g.bookedHours + l.bookedHours);
    g.billedHours = round2(g.billedHours + l.billedHours);
    g.amountCents += l.amountCents;
    if (l.billedHours > 0 && l.centsPerHour == null) g.unrated++;
  }
  const groups = [...map.values()].sort((a, b) => a.entityCode.localeCompare(b.entityCode) || (a.projectCode ?? '￿').localeCompare(b.projectCode ?? '￿'));
  return { groups, amountCents: groups.reduce((s, g) => s + g.amountCents, 0), unrated: groups.reduce((s, g) => s + g.unrated, 0) };
}

/** A rate as typed: euros per hour (comma or dot, 2 decimals at most, 0 to 100,000), a first day, an entity or every one. */
export function checkRate(raw: { eurPerHour: unknown; validFrom: unknown; entityCode: unknown }, entities: ReadonlySet<string>):
  { ok: true; value: { centsPerHour: number; validFrom: string; entityCode: string | null } } | { ok: false; error: string } {
  const text = typeof raw.eurPerHour === 'string' ? raw.eurPerHour.trim().replace(/\s/g, '').replace(',', '.') : '';
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return { ok: false, error: 'Enter a rate in euros per hour (e.g. 85 or 85.50)' };
  const centsPerHour = Math.round(Number(text) * 100);
  if (centsPerHour > 10_000_000) return { ok: false, error: 'Enter a rate in euros per hour (e.g. 85 or 85.50)' };
  const validFrom = typeof raw.validFrom === 'string' ? raw.validFrom : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom) || Number.isNaN(Date.parse(validFrom))) return { ok: false, error: 'Enter the first day of the rate' };
  const e = typeof raw.entityCode === 'string' ? raw.entityCode.trim() : '';
  if (e && !entities.has(e)) return { ok: false, error: 'Choose an entity' };
  return { ok: true, value: { centsPerHour, validFrom, entityCode: e || null } };
}

/** Euros of an amount in cents, for display and exports (2 decimals). */
export const euros = (cents: number) => Math.round(cents) / 100;
