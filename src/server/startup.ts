import 'server-only';
// Server start-up (src/instrumentation.ts → register; copied from Keystone, R-007 / R-002): checks the configuration and, in
// production, opens the database before the server accepts requests, so a misconfigured deployment stops at once with a
// clear log line instead of failing on the first page. In development the problems are logged and the defaults are used.
import { ConfigError, configResult, formatIssues, getConfig, type CrucibleConfig } from '@/server/config';
import { getDb } from '@/server/db/client';
import { log, logError } from '@/server/log';

/** Validates the configuration and logs its warnings and errors; in production also opens the database. Throws to stop. */
export async function startServer(): Promise<CrucibleConfig> {
  const { config, errors, warnings } = configResult();
  for (const w of formatIssues(warnings)) log.warn(`Configuration: ${w}`, { component: 'config' });
  if (errors.length) {
    // Production: the caller logs the error (its message lists every issue) and stops the process.
    if (config.production) throw new ConfigError(errors);
    log.error('Invalid configuration: defaults are used outside production', { component: 'config', issues: formatIssues(errors) });
  }
  log.info('Crucible server starting', {
    component: 'startup', env: config.env, newDatabaseSeed: config.seed, logLevel: config.log.level,
    clock: config.clock?.kind === 'fixed' ? config.clock.iso : 'real',
  });
  // Production: an unreachable database or pending migrations stop the server now.
  if (config.production) await getDb();
  return config;
}

/** instrumentation register() on Node.js: start-up check; in production a failure is logged and stops the process. */
export async function registerNodeServer(exit: (code: number) => never = (code) => process.exit(code)): Promise<void> {
  try {
    await startServer();
  } catch (e) {
    if (getConfig().production) {
      logError('Crucible start-up', e, { component: 'startup' });
      exit(1);
    }
    throw e;
  }
}
