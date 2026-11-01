// Limits of attempts (CR-079, X-13) on a fresh PostgreSQL database: counted per bucket, key and window; the first request over
// the limit is audited once, the next ones of the window refused silently; a new window starts again; old counts purged.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RATE_LIMITS } from '@/domain/rate-limit';
import { auditEntries, rateCounters } from '@/server/db/schema';
import { testDatabase, type TestDatabase } from '@/test/db';
import { hitRate, purgeRateCounters } from './rate-limit';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase({ seed: null });
});
afterAll(async () => t.close());

const who = { name: 'Anonymous', userId: null, role: null };

describe('hitRate', () => {
  it('allows the limit, refuses beyond it with the time left, audits the first excess only', async () => {
    const now = new Date(Date.UTC(2026, 10, 1, 10, 7, 30));
    const { limit } = RATE_LIMITS.sign_in;
    for (let i = 0; i < limit; i++) expect(await hitRate('sign_in', '203.0.113.9', who, now)).toEqual({ ok: true });
    expect(await hitRate('sign_in', '203.0.113.9', who, now)).toEqual({ ok: false, retryAfterSec: 150 });
    expect(await hitRate('sign_in', '203.0.113.9', who, now)).toEqual({ ok: false, retryAfterSec: 150 });
    // Another address, another bucket: their own counts.
    expect(await hitRate('sign_in', '198.51.100.4', who, now)).toEqual({ ok: true });
    expect(await hitRate('calendar', '203.0.113.9', who, now)).toEqual({ ok: true });
    const audits = await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'Limit sign_in'));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ area: 'Security', change: 'limit exceeded: 30 per 600 s', actorName: 'Anonymous' });
    // The next window starts again.
    expect(await hitRate('sign_in', '203.0.113.9', who, new Date(Date.UTC(2026, 10, 1, 10, 10, 0)))).toEqual({ ok: true });
  });

  it('no key (no account, no proxy header): never limited', async () => {
    expect(await hitRate('search', null, who)).toEqual({ ok: true });
  });

  it('counts of windows ended a day ago are purged', async () => {
    expect(await purgeRateCounters(t.db, new Date(Date.UTC(2026, 10, 2, 10, 30, 0)))).toBe(4);
    expect(await t.db.select().from(rateCounters)).toHaveLength(0);
  });
});
