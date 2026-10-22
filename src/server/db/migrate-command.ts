import 'server-only';
// `npm run db:migrate` (scripts/db-migrate.ts): applies the migrations of ./drizzle and seeds an empty database, under an
// advisory lock (deploy step, before the new version starts; two deploys never interleave). An empty database needs
// CRUCIBLE_SEED. The configuration is checked strictly (an invalid variable stops the command, whatever NODE_ENV).
import { assertValidConfig, formatIssues, redactUrl } from '@/server/config';
import { declareCrucibleSchema } from '@/server/integrations/matrix';
import { log } from '@/server/log';
import { DatabaseNotConfiguredError } from './client';
import { MIGRATIONS_FOLDER, migrationFiles } from './migrations';
import { migrateAndSeedPostgres, openPostgres } from './postgres';
import { readSeedRecord } from './seed/mode';

export interface MigrateCommandResult {
  applied: number;
  seeded: boolean;
  /** Seed recorded in the database after the run. */
  seed: string | null;
}

export async function runMigrateCommand(migrationsFolder = MIGRATIONS_FOLDER()): Promise<MigrateCommandResult> {
  const { config, warnings } = assertValidConfig({ strict: true });
  for (const w of formatIssues(warnings)) log.warn(w, { component: 'config' });
  if (!config.database) throw new DatabaseNotConfiguredError();
  log.info('Migrating the database', { component: 'db', url: redactUrl(config.database.url), migrations: migrationFiles(migrationsFolder).length });
  const h = await openPostgres({ url: config.database.url, poolMax: 2, applicationName: 'crucible-migrate' });
  try {
    const r = await migrateAndSeedPostgres(h, config.seedExplicit ? config.seed : null, migrationsFolder);
    const seed = (await readSeedRecord(h.db))?.mode ?? null;
    log.info('Database ready', { component: 'db', applied: r.applied, seeded: r.seeded, seed });
    await declareCrucibleSchema((sql) => h.pool.query(sql).then((x) => x.rows as Record<string, unknown>[]));
    return { ...r, seed };
  } finally {
    await h.close().catch(() => null);
  }
}
