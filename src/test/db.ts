// A fresh PostgreSQL database per test file (Crucible runs on PostgreSQL only): created on the test server
// (CRUCIBLE_TEST_ADMIN_URL, a superuser; default postgres://postgres:postgres@127.0.0.1:5432/postgres), provisioned like the
// shared server (role crucible_app, schema crucible), migrated, seeded (demo by default), and dropped by `close()`. The tests connect
// as the administrator and SET ROLE crucible_app (pool option), so they have exactly crucible_app's rights without ever touching
// the role's password (a developer's local database uses the same role).
//   const t = await testDatabase();  …  await t.close();
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { SeedMode } from '@/server/config/parse';
import { setDb } from '@/server/db/client';
import { migrateAndSeedPostgres, openPostgres, type PostgresHandle } from '@/server/db/postgres';
import { APP_ROLE, provisionDatabase, provisionSchema, withDatabase } from '@/server/db/provision';
import type { DB } from '@/server/db/types';

export const TEST_ADMIN_URL = process.env.CRUCIBLE_TEST_ADMIN_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';

export interface TestDatabase {
  db: DB;
  handle: PostgresHandle;
  /** URL of the test database (administrator credentials: use it with `role`). */
  url: string;
  /** The role to act as on `url`. */
  role: string;
  name: string;
  close(): Promise<void>;
}

async function withClient<T>(url: string, run: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await run(c);
  } finally {
    await c.end();
  }
}

/**
 * A new database: `migrate` (default true) applies the migrations and `seed` (default 'demo'; null = none) seeds it;
 * `useAsDefault` (default true) points getDb() at it.
 */
export async function testDatabase(opts: { migrate?: boolean; seed?: SeedMode | null; useAsDefault?: boolean } = {}): Promise<TestDatabase> {
  const name = `crucible_test_${randomBytes(6).toString('hex')}`;
  await withClient(TEST_ADMIN_URL, (c) => provisionDatabase(c, { database: name }));
  await withClient(withDatabase(TEST_ADMIN_URL, name), (c) => provisionSchema(c));
  const url = withDatabase(TEST_ADMIN_URL, name);
  const handle = await openPostgres({ url, poolMax: 4, applicationName: 'crucible-test', role: APP_ROLE });
  if (opts.migrate ?? true) {
    const seed = opts.seed === undefined ? 'demo' : opts.seed;
    if (seed) await migrateAndSeedPostgres(handle, seed);
    else {
      const { withMigrationLock } = await import('@/server/db/postgres');
      const { applyServerMigrations } = await import('@/server/db/migrations');
      await withMigrationLock(handle.pool, (client) => applyServerMigrations(client));
    }
  }
  if (opts.useAsDefault ?? true) setDb(handle.db);
  return {
    db: handle.db, handle, url, role: APP_ROLE, name,
    async close() {
      await handle.close().catch(() => null);
      await withClient(TEST_ADMIN_URL, (c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
    },
  };
}
