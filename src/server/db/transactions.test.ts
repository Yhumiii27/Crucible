// Every db.transaction() takes Crucible's write lock first, runs READ COMMITTED behind it and is run again after a
// serialization failure or a deadlock (copied from Keystone, R-010), on a real PostgreSQL database.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabase, type TestDatabase } from '@/test/db';
import { TX_RETRY, isRetryableTransactionError, runWithRetry, sqlStateOf, withWriteLockedTransactions } from './transactions';
import type { DB } from './types';

const pgError = (code: string, message = 'pg error') => Object.assign(new Error(message), { code });
/** Drizzle wraps driver errors (DrizzleQueryError) and keeps the driver's error as `cause`. */
const drizzleError = (cause: Error) => Object.assign(new Error('Failed query: update …'), { cause });
const noWait = async () => {};

describe('sqlStateOf / isRetryableTransactionError', () => {
  it('finds the SQLSTATE on the error or in its cause chain', () => {
    expect(sqlStateOf(pgError('40001'))).toBe('40001');
    expect(sqlStateOf(drizzleError(pgError('40P01')))).toBe('40P01');
    expect(sqlStateOf(drizzleError(drizzleError(pgError('23505'))))).toBe('23505');
    expect(sqlStateOf(new Error('plain'))).toBeNull();
    expect(sqlStateOf(Object.assign(new Error('node'), { code: 'ECONNREFUSED' }))).toBeNull();
    expect(sqlStateOf(null)).toBeNull();
  });

  it('retries serialization failures and deadlocks only (a unique violation or a business error is final)', () => {
    expect(isRetryableTransactionError(drizzleError(pgError('40001')))).toBe(true);
    expect(isRetryableTransactionError(pgError('40P01'))).toBe(true);
    expect(isRetryableTransactionError(pgError('23505'))).toBe(false);
    expect(isRetryableTransactionError(new Error('CR-011 is not in review'))).toBe(false);
  });
});

describe('runWithRetry', () => {
  it('runs again after a serialization failure, then returns the result', async () => {
    let n = 0;
    const r = await runWithRetry(async (attempt) => {
      n++;
      if (attempt < 3) throw drizzleError(pgError('40001'));
      return 'R-21';
    }, { wait: noWait });
    expect([r, n]).toEqual(['R-21', 3]);
  });

  it('gives up after TX_RETRY.attempts and rethrows the last error', async () => {
    let n = 0;
    await expect(runWithRetry(async () => {
      n++;
      throw pgError('40001', `attempt ${n}`);
    }, { wait: noWait })).rejects.toThrow(`attempt ${TX_RETRY.attempts}`);
    expect(n).toBe(TX_RETRY.attempts);
  });

  it('never retries other errors', async () => {
    let n = 0;
    await expect(runWithRetry(async () => {
      n++;
      throw new Error('After BL1, a new baseline goes through a change request');
    }, { wait: noWait })).rejects.toThrow('After BL1');
    expect(n).toBe(1);
  });

  it('waits a jittered, bounded back-off between attempts', async () => {
    const waits: number[] = [];
    await runWithRetry(async (a) => {
      if (a < 4) throw pgError('40P01');
      return 1;
    }, { wait: async (ms) => void waits.push(ms), baseDelayMs: 10, maxDelayMs: 50 });
    expect(waits).toHaveLength(3);
    waits.forEach((w, i) => expect(w).toBeLessThanOrEqual(Math.min(50, 10 * 2 ** (i + 1))));
  });
});

describe('withWriteLockedTransactions (PostgreSQL)', () => {
  let t: TestDatabase;
  let db: DB;
  beforeAll(async () => {
    t = await testDatabase({ migrate: false, useAsDefault: false });
    db = t.db;
  });
  afterAll(() => t.close());

  it('takes the write lock first and runs READ COMMITTED unless the caller asks otherwise', async () => {
    const state = async (tx: Pick<DB, 'execute'>) =>
      (await tx.execute(sql`select current_setting('transaction_isolation') as level,
        (select count(*)::int from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()) as locks`)).rows[0];
    expect(await db.transaction((tx) => state(tx))).toEqual({ level: 'read committed', locks: 1 });
    expect(await db.transaction((tx) => state(tx), { isolationLevel: 'serializable' })).toEqual({ level: 'serializable', locks: 1 });
    expect(withWriteLockedTransactions(db, 'other').transaction).toBe(db.transaction);
  });

  it('re-runs the callback after a serialization failure; the first attempt is rolled back', async () => {
    await db.execute(sql`create table crucible.tx_retry_probe (n int)`);
    let runs = 0;
    await db.transaction(async (tx) => {
      runs++;
      await tx.execute(sql`insert into crucible.tx_retry_probe values (${runs})`);
      if (runs === 1) throw drizzleError(pgError('40001'));
    });
    expect(runs).toBe(2);
    expect((await db.execute(sql`select n from crucible.tx_retry_probe order by n`)).rows).toEqual([{ n: 2 }]);
  });

  it('two concurrent writers of the same "max + 1" never collide', async () => {
    await db.execute(sql`create table crucible.tx_numbers (n int primary key)`);
    await Promise.all(Array.from({ length: 10 }, () => db.transaction(async (tx) => {
      const r = await tx.execute(sql`select coalesce(max(n), 0) + 1 as next from crucible.tx_numbers`);
      await tx.execute(sql`insert into crucible.tx_numbers values (${(r.rows[0] as { next: number }).next})`);
    })));
    expect((await db.execute(sql`select count(*)::int as c, max(n) as m from crucible.tx_numbers`)).rows[0]).toEqual({ c: 10, m: 10 });
  });
});
