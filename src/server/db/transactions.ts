import 'server-only';
// Concurrent writes (copied from Keystone, R-010). Every data-layer writer runs its checks and writes in one
// `db.transaction()`. With several users (and several server instances on PostgreSQL) two transactions may read the same
// state and both write — two "max + 1" numbers, two decisions of the same gate. Every transaction takes Crucible's write lock
// first and runs behind it one at a time (withWriteLockedTransactions below, shared EPC2I server); a serialization failure
// (SQLSTATE 40001) or a deadlock (40P01) runs it again from the start on fresh data, up to TX_RETRY.attempts times.
//
// Consequence for writers: a transaction callback may run more than once. It must only touch the database through `tx`
// (no HTTP call, no e-mail) and must not accumulate into variables declared outside the callback without resetting them.
import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core';
import { log } from '@/server/log';
import type { DB } from './types';

export const TX_RETRY = {
  /** Runs of one transaction (first try included). */
  attempts: 6,
  /** Back-off before the n-th retry: random in [0, min(maxDelayMs, baseDelayMs × 2^n)]. */
  baseDelayMs: 10,
  maxDelayMs: 400,
} as const;

/** serialization_failure, deadlock_detected. */
const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']);

/** SQLSTATE of a database error, looking through Drizzle's DrizzleQueryError and `cause` chains; null when none. */
export function sqlStateOf(e: unknown): string | null {
  let cur: unknown = e;
  for (let depth = 0; cur && typeof cur === 'object' && depth < 6; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

/** True for the errors after which a transaction is run again (serialization failure, deadlock). */
export const isRetryableTransactionError = (e: unknown) => RETRYABLE_SQLSTATES.has(sqlStateOf(e) ?? '');

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs `attempt` until it succeeds, retrying the retryable errors with a jittered exponential back-off. */
export async function runWithRetry<T>(
  attempt: (n: number) => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = opts.attempts ?? TX_RETRY.attempts;
  const wait = opts.wait ?? sleep;
  for (let n = 1; ; n++) {
    try {
      return await attempt(n);
    } catch (e) {
      if (n >= attempts || !isRetryableTransactionError(e)) throw e;
      const cap = Math.min(opts.maxDelayMs ?? TX_RETRY.maxDelayMs, (opts.baseDelayMs ?? TX_RETRY.baseDelayMs) * 2 ** n);
      log.debug('Transaction retried after a concurrent write', { attempt: n, sqlState: sqlStateOf(e) });
      await wait(Math.random() * cap);
    }
  }
}

const WRAPPED = Symbol.for('crucible.lockedTransactions');

const inWriteLock = new AsyncLocalStorage<true>();

/**
 * PostgreSQL server (shared EPC2I server, plan § 4.5 in Matrix): every `db.transaction()` of this handle first takes Crucible's
 * write lock — pg_advisory_xact_lock(hashtext(lockName)), released at commit or rollback — so Crucible's transactions run one
 * after the other while plain reads stay parallel (Keystone measured it: under SERIALIZABLE + retry alone, many simultaneous
 * writers of the same "max + 1" exhaust the retries; behind the lock none fails).
 * The transaction runs READ COMMITTED (unless the caller asks for another level): under SERIALIZABLE the snapshot would be taken
 * by the lock statement itself, before the wait, and the transaction would then read the state from before the previous
 * holder's commit. Behind the lock the transactions are executed serially, which is at least as strong. A deadlock is still
 * retried (runWithRetry). A top-level transaction opened inside the callback of another one (same async context) does not
 * wait for the lock its caller holds.
 */
export function withWriteLockedTransactions<D extends DB>(db: D, lockName: string): D {
  const holder = db as D & { [WRAPPED]?: true };
  if (holder[WRAPPED]) return db;
  const original: DB['transaction'] = db.transaction.bind(db);
  const lock = sql`select pg_advisory_xact_lock(hashtext(${lockName}))`;
  const transaction: DB['transaction'] = (cb, config?: PgTransactionConfig) => {
    if (inWriteLock.getStore()) return runWithRetry(() => original(cb, { isolationLevel: 'read committed', ...config }));
    return runWithRetry(() =>
      original(async (tx) => {
        await tx.execute(lock);
        return inWriteLock.run(true, () => cb(tx));
      }, { isolationLevel: 'read committed', ...config }),
    );
  };
  Object.defineProperty(db, 'transaction', { value: transaction, configurable: true, writable: true });
  Object.defineProperty(db, WRAPPED, { value: true });
  return db;
}
