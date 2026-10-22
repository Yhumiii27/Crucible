import 'server-only';
// Database of this server process (copied from Keystone, R-002): the PostgreSQL database of DATABASE_URL (Crucible runs on
// PostgreSQL only), through a node-postgres pool (./postgres.ts). Migrations and the seed run at deploy time
// (`npm run db:migrate`); a database with pending migrations is refused. `next build` never opens it: pages that read data
// are dynamic (they read the session cookie).
import { getConfig, type SeedMode } from '@/server/config';
import { declareCrucibleSchema } from '@/server/integrations/matrix';
import { log } from '@/server/log';
import { PendingMigrationsError, pendingMigrations } from './migrations';
import { databaseSeedMode } from './seed/mode';
import type { DB } from './types';

export type { DB, Tx } from './types';

const g = globalThis as unknown as { __crucibleDb?: Promise<DB> };

/** No DATABASE_URL: Crucible has no embedded database. */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not set: Crucible needs a PostgreSQL database (on a developer machine: "npm run db:local", see README)');
    this.name = 'DatabaseNotConfiguredError';
  }
}

async function openConfigured(): Promise<DB> {
  const cfg = getConfig();
  if (!cfg.database) throw new DatabaseNotConfiguredError();
  if (process.env.NEXT_PHASE === 'phase-production-build') throw new Error('next build must not open the database');
  const { openPostgres } = await import('./postgres');
  const h = await openPostgres({ url: cfg.database.url, poolMax: cfg.database.poolMax });
  try {
    const pending = await pendingMigrations(h.db);
    if (pending.length) throw new PendingMigrationsError(pending.length);
  } catch (e) {
    await h.close().catch(() => null);
    throw e;
  }
  log.info('Database opened', { component: 'db', poolMax: cfg.database.poolMax });
  // The schema, checked up to date above, is declared to Matrix in the background (an unchanged declaration is ignored).
  declareCrucibleSchema((sql) => h.pool.query(sql).then((r) => r.rows as Record<string, unknown>[]));
  await warnSeedMismatch(h.db, cfg.seedExplicit ? cfg.seed : null);
  return h.db;
}

/** CRUCIBLE_SEED only applies to a new database: say so when an existing one was seeded otherwise. */
async function warnSeedMismatch(db: DB, wanted: SeedMode | null): Promise<void> {
  if (!wanted) return;
  const actual = await databaseSeedMode(db).catch(() => null);
  if (actual && actual !== wanted)
    log.warn(`The database holds the ${actual} data set; CRUCIBLE_SEED=${wanted} only applies to a new database`, { component: 'db', seed: actual });
}

/** Database handle (singleton per server process; survives dev hot reloads). A failed open is retried by the next call. */
export function getDb(): Promise<DB> {
  if (!g.__crucibleDb) g.__crucibleDb = openConfigured().catch((e) => { g.__crucibleDb = undefined; throw e; });
  return g.__crucibleDb;
}

/** Points getDb() at another database (scripts and tests). */
export function setDb(db: DB | Promise<DB>): void {
  g.__crucibleDb = Promise.resolve(db);
}
