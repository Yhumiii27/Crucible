import 'server-only';
// Limits of attempts (CR-079, X-13): one atomic upsert per request in `rate_counters` (outside the write lock: a count is not a
// business write), shared by every instance. The first request over the limit in a window is logged and written to the
// audit trail ("Security"); the next ones of the window are refused without a trace. Old windows are purged daily.
import { lt, sql } from 'drizzle-orm';
import { RATE_LIMITS, retryAfter, windowStart, type RateBucket } from '@/domain/rate-limit';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { rateCounters } from '@/server/db/schema';
import type { DB } from '@/server/db/types';
import { log } from '@/server/log';

export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

/** Counts one request of `key` (an account id or an address) in `bucket`; refused past the limit of the window. */
export async function hitRate(bucket: RateBucket, key: string | null, who: { name: string; userId: string | null; role: string | null }, now = new Date(), q?: DB): Promise<RateResult> {
  if (!key) return { ok: true };
  const db = q ?? (await getDb());
  const rule = RATE_LIMITS[bucket];
  const start = new Date(windowStart(now.getTime(), rule.windowSec));
  const res = await db.execute(sql`
    insert into ${rateCounters} (bucket, key, window_start, count) values (${bucket}, ${key}, ${start}, 1)
    on conflict (bucket, key, window_start) do update set count = ${rateCounters.count} + 1
    returning count`);
  const count = Number((res.rows[0] as { count: number | string }).count);
  if (count <= rule.limit) return { ok: true };
  if (count === rule.limit + 1) {
    log.warn('Rate limit exceeded', { component: 'rate-limit', bucket, by: rule.by, limit: rule.limit, windowSec: rule.windowSec });
    await writeAudit(db, {
      actorName: who.name, actorUserId: who.userId, actorRole: who.role, area: 'Security', objectRef: `Limit ${bucket}`,
      change: `limit exceeded: ${rule.limit} per ${rule.windowSec} s`, entityType: 'rate_limit', after: { bucket, by: rule.by, key: rule.by === 'address' ? key : undefined, window: start.toISOString() },
    });
  }
  return { ok: false, retryAfterSec: retryAfter(now.getTime(), rule.windowSec) };
}

/** Removes the counts of windows ended more than a day ago. */
export async function purgeRateCounters(db: DB, now = new Date()): Promise<number> {
  const gone = await db.delete(rateCounters).where(lt(rateCounters.windowStart, new Date(now.getTime() - 86_400_000))).returning({ k: rateCounters.key });
  return gone.length;
}

/** 429 with Retry-After, for the routes. */
export const tooManyRequests = (retryAfterSec: number) =>
  new Response('Too many requests', { status: 429, headers: { 'Retry-After': String(retryAfterSec), 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
