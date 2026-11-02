// REST API and webhooks of the bench systems (CR-083, X-17): what a client may declare, the period of a bookings read, the
// booking as the API shows it (a confidential project masked, as in the published view pub_reservations, S-7) and the delay
// before the next attempt of a webhook that failed. Pure: no import.

/** Kinds of the events: a booking created or changed status, a booking moved, an incident on a resource declared or closed. */
export const API_EVENT_KINDS = [
  'booking.requested', 'booking.confirmed', 'booking.in_progress', 'booking.done', 'booking.cancelled', 'booking.no_show', 'booking.moved',
  'incident.open', 'incident.closed',
] as const;

/** Version of the API in its paths (`/api/v1`): a field is never removed or renamed within a version, new ones are added. */
export const API_VERSION = 'v1';

/** Longest period of one bookings read (days), and the default one around today. */
export const API_MAX_DAYS = 186;
export const API_DEFAULT_BACK_DAYS = 7;
export const API_DEFAULT_AHEAD_DAYS = 30;
/** Events per page of /api/v1/events and per webhook run. */
export const API_EVENTS_PAGE = 100;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ApiClientInput {
  label: string;
  webhookUrl: string | null;
}

/**
 * A client as declared by the facility manager: a name (1 to 80 characters) and an optional webhook address, http or https,
 * without credentials in it (the signature authenticates Crucible), at most 500 characters.
 */
export function checkApiClient(raw: { label: unknown; webhookUrl: unknown }): Checked<ApiClientInput> {
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (!label) return { ok: false, error: 'Give the system a name' };
  if (label.length > 80) return { ok: false, error: 'The name is too long (80 characters at most)' };
  const urlText = typeof raw.webhookUrl === 'string' ? raw.webhookUrl.trim() : '';
  if (!urlText) return { ok: true, value: { label, webhookUrl: null } };
  const url = webhookAddress(urlText);
  if (!url) return { ok: false, error: 'The webhook address must be an http or https address without a user name or password' };
  return { ok: true, value: { label, webhookUrl: url } };
}

/** A webhook address as stored, or null when it is not acceptable. */
export function webhookAddress(text: string): string | null {
  if (text.length > 500) return null;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || !u.hostname) return null;
  u.hash = '';
  return u.toString();
}

const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The period of a bookings read: `from` and `to` are days (YYYY-MM-DD, `to` included) or instants (ISO 8601); by default 7 days
 * back to 30 days ahead of `now`. At most API_MAX_DAYS days.
 */
export function apiPeriod(fromRaw: string | null, toRaw: string | null, now: number): Checked<{ from: number; to: number }> {
  const read = (s: string | null, end: boolean): number | null | undefined => {
    if (s == null || s === '') return undefined;
    if (DATE_RE.test(s)) {
      const t = Date.parse(`${s}T00:00:00Z`);
      return Number.isNaN(t) ? null : end ? t + DAY : t;
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  };
  const f = read(fromRaw, false);
  const t = read(toRaw, true);
  if (f === null) return { ok: false, error: 'from: a day (YYYY-MM-DD) or an ISO 8601 instant' };
  if (t === null) return { ok: false, error: 'to: a day (YYYY-MM-DD) or an ISO 8601 instant' };
  const from = f ?? (t !== undefined ? t - (API_DEFAULT_BACK_DAYS + API_DEFAULT_AHEAD_DAYS) * DAY : now - API_DEFAULT_BACK_DAYS * DAY);
  const to = t ?? (f !== undefined ? f + (API_DEFAULT_BACK_DAYS + API_DEFAULT_AHEAD_DAYS) * DAY : now + API_DEFAULT_AHEAD_DAYS * DAY);
  if (to <= from) return { ok: false, error: 'to must be after from' };
  if (to - from > API_MAX_DAYS * DAY) return { ok: false, error: `The period is too long (${API_MAX_DAYS} days at most)` };
  return { ok: true, value: { from, to } };
}

/** The cursor of /api/v1/events (`after`): a whole number ≥ 0, 0 by default; null when invalid. */
export function eventCursor(raw: string | null): number | null {
  if (raw == null || raw === '') return 0;
  if (!/^\d{1,15}$/.test(raw)) return null;
  return Number(raw);
}

export interface BookingFacts {
  ref: string;
  resourceCode: string;
  facilityCode: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  setupMinutes: number;
  teardownMinutes: number;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  projectCode: string;
  keystoneCode: string | null;
  entityCode: string;
  title: string;
  operators: string | null;
  seriesRef: string | null;
  confidential: boolean;
  updatedAt: Date;
}

export interface ApiBooking {
  ref: string;
  resource: string;
  facility: string;
  status: string;
  start: string;
  end: string;
  setupMinutes: number;
  teardownMinutes: number;
  actualStart: string | null;
  actualEnd: string | null;
  /** Null for a confidential project (U-3, S-7), as are keystoneProject, purpose and operators. */
  project: string | null;
  keystoneProject: string | null;
  entity: string;
  purpose: string | null;
  operators: string | null;
  confidential: boolean;
  series: string | null;
  updatedAt: string;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** A booking as the API shows it: a bench system never learns the project, the purpose or the people of a confidential one. */
export function apiBooking(b: BookingFacts): ApiBooking {
  const open = !b.confidential;
  return {
    ref: b.ref,
    resource: b.resourceCode,
    facility: b.facilityCode,
    status: b.status,
    start: b.startsAt.toISOString(),
    end: b.endsAt.toISOString(),
    setupMinutes: b.setupMinutes,
    teardownMinutes: b.teardownMinutes,
    actualStart: iso(b.actualStartAt),
    actualEnd: iso(b.actualEndAt),
    project: open ? b.projectCode : null,
    keystoneProject: open ? b.keystoneCode : null,
    entity: b.entityCode,
    purpose: open ? b.title : null,
    operators: open ? b.operators : null,
    confidential: b.confidential,
    series: b.seriesRef,
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** Minutes before the next attempt after `failures` failed attempts in a row: 1, 2, 4… up to 60. */
export function retryDelayMin(failures: number): number {
  return Math.min(60, 2 ** Math.max(0, failures - 1));
}

/** What a webhook's answer means: delivered on a 2xx, else the error kept on the client. */
export function deliveryError(status: number): string | null {
  return status >= 200 && status < 300 ? null : `HTTP ${status}`;
}
