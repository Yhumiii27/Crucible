// The start-up check (instrumentation register) and `npm run db:migrate` on PostgreSQL (copied from Keystone, R-007 / R-002).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfigError } from '@/server/config';
import { setDb } from '@/server/db/client';
import { runMigrateCommand } from '@/server/db/migrate-command';
import { migrationFiles } from '@/server/db/migrations';
import type { DB } from '@/server/db/types';
import { testDatabase, type TestDatabase } from '@/test/db';
import { registerNodeServer, startServer } from './startup';

let t: TestDatabase;
let db: DB;
beforeAll(async () => {
  t = await testDatabase({ seed: 'production', useAsDefault: false });
  db = t.db;
});
afterAll(() => t.close());

const lines: { level: string; line: string }[] = [];
const capture = () => {
  lines.length = 0;
  for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation((line: string) => void lines.push({ level, line }));
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDb(db);
});

describe('startServer', () => {
  it('development: an invalid variable is logged, the defaults are used, the server starts', async () => {
    capture();
    vi.stubEnv('LOG_FORMAT', 'json');
    vi.stubEnv('CRUCIBLE_SEED', 'sample');
    const cfg = await startServer();
    expect(cfg.seed).toBe('demo');
    const err = lines.find((l) => l.level === 'error')!;
    expect(JSON.parse(err.line)).toMatchObject({ msg: 'Invalid configuration: defaults are used outside production', issues: ['CRUCIBLE_SEED must be "demo" or "production"'] });
    expect(lines.some((l) => JSON.parse(l.line).msg === 'Crucible server starting')).toBe(true);
  });

  it('production: an invalid configuration stops the start (ConfigError), before the database is opened', async () => {
    capture();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', '');
    // Reaching the database would reject with this error instead of the ConfigError.
    const unreachable = Promise.reject(new Error('database reached'));
    unreachable.catch(() => null);
    setDb(unreachable);
    await expect(startServer()).rejects.toBeInstanceOf(ConfigError);
  });

  it('production: a valid configuration opens the database before serving; warnings are logged', async () => {
    capture();
    vi.stubEnv('NODE_ENV', 'production');
    // The test run pins the clock (vitest.config.ts); production runs on the real clock.
    vi.stubEnv('CRUCIBLE_CLOCK', '');
    const cfg = await startServer();
    expect(cfg.production).toBe(true);
    const warned = lines.filter((l) => l.level === 'warn').map((l) => JSON.parse(l.line).msg);
    expect(warned).toEqual([
      'Configuration: NEXT_PUBLIC_KEYSTONE_URL is not set: links open Keystone on localhost',
      'Configuration: NEXT_PUBLIC_CODEX_URL is not set: links open Codex on localhost',
      'Configuration: NEXT_PUBLIC_VIGIE_URL is not set: links open Vigie on localhost',
      'Configuration: CRUCIBLE_AUTH is not set: demo mode ("View as", no sign-in) — set it to "entra" for real users, or "demo" explicitly',
    ]);
    // The database failing to open stops the start too.
    setDb(Promise.reject(new Error('The database has 1 pending migration: run "npm run db:migrate" before starting Crucible')));
    await expect(startServer()).rejects.toThrow(/pending migration/);
  });
});

describe('registerNodeServer (instrumentation register)', () => {
  it('production: logs the failure as one line and exits with code 1; development: rethrows', async () => {
    capture();
    vi.stubEnv('LOG_FORMAT', 'json');
    vi.stubEnv('CRUCIBLE_SEED', 'sample');
    vi.stubEnv('NODE_ENV', 'production');
    const exit = vi.fn((code: number): never => {
      throw new Error(`exit ${code}`);
    });
    await expect(registerNodeServer(exit)).rejects.toThrow('exit 1');
    expect(exit).toHaveBeenCalledWith(1);
    const line = JSON.parse(lines.find((l) => l.level === 'error')!.line);
    expect(line).toMatchObject({ msg: 'Crucible start-up failed', component: 'startup', err: { type: 'ConfigError', message: 'Invalid configuration: CRUCIBLE_SEED must be "demo" or "production"' } });
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CRUCIBLE_SEED', '');
    setDb(db);
    await expect(registerNodeServer(exit)).resolves.toBeUndefined();
    expect(exit).toHaveBeenCalledTimes(1);
  });
});

describe('npm run db:migrate', () => {
  it('migrates and seeds an empty schema; a second run has nothing to do; an empty database needs CRUCIBLE_SEED; strict configuration', async () => {
    const fresh = await testDatabase({ migrate: false, useAsDefault: false });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.stubEnv('DATABASE_URL', fresh.url);
      vi.stubEnv('CRUCIBLE_SEED', '');
      await expect(runMigrateCommand()).rejects.toThrow(/set CRUCIBLE_SEED/);
      vi.stubEnv('CRUCIBLE_SEED', 'production');
      // The refused run rolled nothing back: its migrations are applied, the seed waits for the choice.
      expect(await runMigrateCommand()).toEqual({ applied: 0, seeded: true, seed: 'production' });
      vi.stubEnv('CRUCIBLE_SEED', 'demo');
      expect(await runMigrateCommand()).toEqual({ applied: 0, seeded: false, seed: 'production' });
      vi.stubEnv('LOG_LEVEL', 'chatty');
      await expect(runMigrateCommand()).rejects.toBeInstanceOf(ConfigError);
      expect(migrationFiles().length).toBeGreaterThan(0);
    } finally {
      await fresh.close();
    }
  }, 120_000);
});
