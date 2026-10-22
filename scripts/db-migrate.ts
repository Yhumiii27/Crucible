// npm run db:migrate — applies the migrations of ./drizzle to the PostgreSQL database of DATABASE_URL (schema crucible) and seeds
// an empty schema, under an advisory lock (run it at deploy time, before the new version starts; copied from Keystone,
// R-002). An empty schema needs CRUCIBLE_SEED=production (reference data only) or demo.
// The .env files are read as Next reads them. Exit code 0 when the database is ready, 1 otherwise.
//   npx tsx --conditions=react-server scripts/db-migrate.ts
import { loadEnvFiles } from '@/server/config/env-files';

async function main(): Promise<void> {
  loadEnvFiles(process.cwd());
  const { runMigrateCommand } = await import('@/server/db/migrate-command');
  await runMigrateCommand();
}

main().then(
  () => process.exit(0),
  async (e) => {
    const { logError } = await import('@/server/log');
    logError('db:migrate', e, { component: 'db' });
    process.exit(1);
  },
);
