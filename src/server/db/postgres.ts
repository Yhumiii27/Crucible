import 'server-only';
// Crucible's PostgreSQL connection (copied from Keystone, R-002): drizzle-orm/node-postgres over a connection pool. The
// application never migrates nor seeds the database: `npm run db:migrate` does both at deploy time under an advisory lock;
// getDb() refuses to start on a database with pending migrations. Every connection sets search_path=crucible (./server-schema.ts).
import type { Pool, PoolClient } from 'pg';
import { log } from '@/server/log';
import type { SeedMode } from '@/server/config/parse';
import { MIGRATIONS_FOLDER, applyServerMigrations, type MigrationClient } from './migrations';
import * as schema from './schema';
import { MIGRATION_LOCK_NAME, SERVER_CONNECTION_OPTIONS, WRITE_LOCK_NAME } from './server-schema';
import { seedIfEmpty } from './seed';
import { readSeedRecord } from './seed/mode';
import { withWriteLockedTransactions } from './transactions';
import type { DB } from './types';

export interface PostgresOptions {
  url: string;
  /** Largest number of connections of this process (DATABASE_POOL_MAX, default 10). */
  poolMax: number;
  /** Shown in pg_stat_activity. */
  applicationName?: string;
  /** Role every connection switches to (tests: an administrator connection acting as crucible_app). */
  role?: string;
}

export interface PostgresHandle {
  db: DB;
  pool: Pool;
  /** Closes the pool (scripts, tests). */
  close(): Promise<void>;
}

/** Pool settings: idle connections are closed after 30 s, a connection attempt fails after 10 s. */
export const POOL_TIMEOUTS = { idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 } as const;

/** Opens a pool and the Drizzle handle over it (transactions behind Crucible's write lock, with retry). */
export async function openPostgres(opts: PostgresOptions): Promise<PostgresHandle> {
  const [{ default: pg }, { drizzle }] = await Promise.all([import('pg'), import('drizzle-orm/node-postgres')]);
  const pool = new pg.Pool({
    connectionString: opts.url, max: opts.poolMax, application_name: opts.applicationName ?? 'crucible', options: opts.role ? `${SERVER_CONNECTION_OPTIONS} -c role=${opts.role}` : SERVER_CONNECTION_OPTIONS, ...POOL_TIMEOUTS,
  });
  // An idle connection dropped by the server must not crash the process: the pool replaces it.
  pool.on('error', (err) => log.error('PostgreSQL pool connection error', { component: 'db', err }));
  const raw = drizzle({ client: pool, schema });
  return { db: withWriteLockedTransactions<DB>(raw as unknown as DB, WRITE_LOCK_NAME), pool, close: () => pool.end() };
}

/**
 * Holds the migration lock — pg_advisory_lock(hashtext('crucible.migrations')) — on a dedicated connection while `run`
 * executes; `run` receives that connection (the migrator runs on it).
 */
export async function withMigrationLock<T>(pool: Pool, run: (client: MigrationClient) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_NAME]);
    return await run(client as unknown as MigrationClient);
  } finally {
    await client.query('select pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_NAME]).catch(() => null);
    client.release();
  }
}

export interface MigrateResult {
  /** Migrations applied by this run. */
  applied: number;
  /** True when this run seeded an empty database. */
  seeded: boolean;
}

/** An empty database needs an explicit CRUCIBLE_SEED (demo or production). */
export class SeedChoiceRequiredError extends Error {
  constructor() {
    super('The database is empty: set CRUCIBLE_SEED to "production" (reference data only) or "demo" (demonstration data set) to seed it');
    this.name = 'SeedChoiceRequiredError';
  }
}

/**
 * `npm run db:migrate`: applies the pending migrations, then seeds the database when it is empty (`seed`), all under the
 * migration lock. `seed: null` refuses to seed an empty database (CRUCIBLE_SEED must be chosen explicitly).
 */
export async function migrateAndSeedPostgres(h: PostgresHandle, seed: SeedMode | null, migrationsFolder = MIGRATIONS_FOLDER()): Promise<MigrateResult> {
  return withMigrationLock(h.pool, async (client) => {
    const applied = await applyServerMigrations(client, migrationsFolder);
    if (!seed && !(await readSeedRecord(h.db))) throw new SeedChoiceRequiredError();
    const seeded = await seedIfEmpty(h.db, { mode: seed ?? undefined });
    return { applied, seeded };
  });
}
