// npm run backup — one backup of the `crucible` schema now (pg_dump, custom format) into CRUCIBLE_BACKUP_DIR (or the folder given
// as argument), then the retention. Use it before an upgrade.
//   npm run backup [-- <folder>]
import { loadEnvFiles } from '@/server/config/env-files';

async function main(): Promise<void> {
  loadEnvFiles(process.cwd());
  const { assertValidConfig } = await import('@/server/config');
  const { backupSchema } = await import('@/server/backup');
  const { config } = assertValidConfig({ strict: true });
  const dir = process.argv[2] ?? config.backup.dir;
  if (!config.database) throw new Error('DATABASE_URL is not set');
  if (!dir) throw new Error('Set CRUCIBLE_BACKUP_DIR or give the backup folder as argument');
  const r = await backupSchema({ databaseUrl: config.database.url, dir, retentionDays: config.backup.retentionDays });
  console.log(`Backup written: ${r.file}${r.deleted.length ? ` (${r.deleted.length} expired removed)` : ''}`);
}

main().then(() => process.exit(0), (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
