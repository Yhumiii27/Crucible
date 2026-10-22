// The job runner on PostgreSQL: a due job runs once, a job not due or leased elsewhere waits, a failure is recorded.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { testDatabase, type TestDatabase } from '@/test/db';
import { runDueJobs, type Job } from './runner';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase({ seed: 'production' });
});
afterAll(() => t.close());

const job = (name: string, run: Job['run'], everyMin = 60): Job => ({ name, everyMin, enabled: true, run });

describe('job runner', () => {
  it('runs a due job once per period, records its outcome, skips disabled jobs', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const run = vi.fn(async () => 'done');
    const t0 = new Date('2026-10-22T08:00:00Z');
    expect(await runDueJobs(t.db, [job('a', run), { ...job('off', run), enabled: false }], t0)).toEqual(['a']);
    expect(await runDueJobs(t.db, [job('a', run)], new Date('2026-10-22T08:30:00Z'))).toEqual([]);
    expect(await runDueJobs(t.db, [job('a', run)], new Date('2026-10-22T09:00:00Z'))).toEqual(['a']);
    expect(run).toHaveBeenCalledTimes(2);
    const row = (await t.db.execute(sql`select last_status, lease_until from crucible.job_runs where name = 'a'`)).rows[0];
    expect(row).toEqual({ last_status: 'ok', lease_until: null });
  });

  it('never runs a job two runners claim at the same time', async () => {
    let n = 0;
    const slow = job('slow', async () => {
      n++;
      await new Promise((r) => setTimeout(r, 50));
    });
    const now = new Date('2026-10-22T10:00:00Z');
    const [a, b] = await Promise.all([runDueJobs(t.db, [slow], now), runDueJobs(t.db, [slow], now)]);
    expect([...a, ...b]).toEqual(['slow']);
    expect(n).toBe(1);
  });

  it('records a failure without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runDueJobs(t.db, [job('boom', async () => { throw new Error('disk full'); })], new Date('2026-10-22T11:00:00Z'))).toEqual(['boom']);
    expect((await t.db.execute(sql`select last_status, last_error from crucible.job_runs where name = 'boom'`)).rows[0]).toEqual({ last_status: 'error', last_error: 'disk full' });
  });
});
