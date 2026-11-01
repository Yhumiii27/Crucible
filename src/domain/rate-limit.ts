// Limits of attempts (CR-079, X-13): how many requests a person (by account) or an address may make per window on the routes
// that cost or that a robot would hammer. Fixed windows counted in the database (one count per bucket, key and window), so
// every instance of the application shares them. Pure: no import.

export const RATE_BUCKETS = ['sign_in', 'search', 'export', 'assistant', 'device', 'calendar'] as const;
export type RateBucket = (typeof RATE_BUCKETS)[number];

export interface RateLimit {
  /** Requests allowed per window and per key. */
  limit: number;
  windowSec: number;
  /** Counted per account (a person signed in) or per address. */
  by: 'user' | 'address';
}

export const RATE_LIMITS: Record<RateBucket, RateLimit> = {
  /** Microsoft Entra sign-in and its return, per address. */
  sign_in: { limit: 30, windowSec: 600, by: 'address' },
  /** Global search of the header, typed letter by letter, per person. */
  search: { limit: 120, windowSec: 60, by: 'user' },
  /** CSV exports, per person. */
  export: { limit: 30, windowSec: 600, by: 'user' },
  /** Questions to the assistant (Claude costs per question), per person. */
  assistant: { limit: 30, windowSec: 600, by: 'user' },
  /** Occupancy devices (POST /api/occupancy), per address. */
  device: { limit: 600, windowSec: 600, by: 'address' },
  /** Calendar subscriptions read by Outlook (GET /api/calendar), per address. */
  calendar: { limit: 120, windowSec: 600, by: 'address' },
};

/** Start of the window holding `now` (ms since the epoch). */
export const windowStart = (now: number, windowSec: number) => Math.floor(now / (windowSec * 1000)) * windowSec * 1000;

/** Seconds left in the window. */
export const retryAfter = (now: number, windowSec: number) => Math.max(1, Math.ceil((windowStart(now, windowSec) + windowSec * 1000 - now) / 1000));

/**
 * The client's address as the reverse proxy (Traefik, Coolify) saw it: the last entry of X-Forwarded-For, which the proxy
 * appends (earlier entries are whatever the client sent), else X-Real-IP; null without a proxy header.
 */
export function clientAddress(forwardedFor: string | null, realIp: string | null): string | null {
  const last = forwardedFor?.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
  const a = (last || realIp?.trim() || '').slice(0, 64);
  return a || null;
}
