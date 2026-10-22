import 'server-only';
// Backup and restore of the `crucible` schema with pg_dump / pg_restore 16 (custom format). The password never appears on a
// command line: it goes in PGPASSWORD. Restore replaces the schema's content (--clean --if-exists) and is refused without an
// explicit confirmation (scripts/restore.ts).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { backupFileName, expiredBackups } from '@/domain/backup';
import { SERVER_SCHEMA } from '@/server/db/server-schema';

/** The connection URL without its password, and the password for PGPASSWORD. */
export function splitCredentials(url: string): { url: string; password: string | null } {
  const u = new URL(url);
  const password = u.password ? decodeURIComponent(u.password) : null;
  u.password = '';
  return { url: u.toString(), password };
}

function run(cmd: string, args: string[], password: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...(password ? { PGPASSWORD: password } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += String(d)));
    p.stderr.on('data', (d) => (err += String(d)));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited with ${code}: ${err.trim().slice(0, 500)}`))));
  });
}

/** Dumps the schema into `dir` and prunes the backups past the retention. Returns the new file and the deleted ones. */
export async function backupSchema(opts: { databaseUrl: string; dir: string; retentionDays: number; now?: Date; role?: string }): Promise<{ file: string; deleted: string[] }> {
  const now = opts.now ?? new Date();
  fs.mkdirSync(opts.dir, { recursive: true });
  const file = path.join(opts.dir, backupFileName(now));
  const partial = `${file}.partial`;
  const { url, password } = splitCredentials(opts.databaseUrl);
  await run('pg_dump', ['--dbname', url, `--schema=${SERVER_SCHEMA}`, '--format=custom', '--no-owner', '--no-privileges', ...(opts.role ? [`--role=${opts.role}`] : []), '--file', partial], password);
  fs.renameSync(partial, file);
  const deleted = expiredBackups(fs.readdirSync(opts.dir), now, opts.retentionDays);
  for (const name of deleted) fs.rmSync(path.join(opts.dir, name), { force: true });
  return { file, deleted };
}

/**
 * Restores a backup file into the schema of `databaseUrl`: its objects are dropped and recreated in one transaction. The
 * schema itself is kept (crucible_app may not create a schema): its entry is left out of the restore list.
 */
export async function restoreSchema(opts: { databaseUrl: string; file: string; role?: string }): Promise<void> {
  if (!fs.existsSync(opts.file)) throw new Error(`No backup file ${opts.file}`);
  const { url, password } = splitCredentials(opts.databaseUrl);
  const toc = await run('pg_restore', ['--list', opts.file], null);
  const list = `${opts.file}.restore-list`;
  fs.writeFileSync(list, toc.split('\n').filter((l) => !/ SCHEMA - /.test(l)).join('\n'));
  try {
    await run('pg_restore', ['--dbname', url, '--use-list', list, '--clean', '--if-exists', '--no-owner', '--no-privileges', ...(opts.role ? [`--role=${opts.role}`] : []), '--single-transaction', opts.file], password);
  } finally {
    fs.rmSync(list, { force: true });
  }
}
