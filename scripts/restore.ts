// npm run restore -- <backup file> --yes — replaces the content of the `crucible` schema of DATABASE_URL by a backup (its tables
// are dropped and recreated in one transaction). Stop the web servers and the worker first. Refused without --yes.
import { loadEnvFiles } from '@/server/config/env-files';

async function main(): Promise<void> {
  loadEnvFiles(process.cwd());
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file || !process.argv.includes('--yes')) throw new Error('Usage: npm run restore -- <backup file> --yes (the schema content is replaced)');
  const { assertValidConfig, redactUrl } = await import('@/server/config');
  const { restoreSchema } = await import('@/server/backup');
  const { config } = assertValidConfig({ strict: true });
  if (!config.database) throw new Error('DATABASE_URL is not set');
  await restoreSchema({ databaseUrl: config.database.url, file });
  console.log(`Restored ${file} into ${redactUrl(config.database.url)}`);
}

main().then(() => process.exit(0), (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
