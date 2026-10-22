// Matrix (the EPC2I data catalogue): Crucible declares its database schema after its migrations and when a server starts
// (contract matrix.schema/1, ./declare-schema.ts; copied from Keystone). Matrix accepts `app: "crucible"` once its server lists
// Crucible (docs/DEMANDES-MATRIX.md M-8). Send-only: no mirror, no outbox, no screen.
import { log as appLog } from '@/server/log';
import { declareSchema, introspectPostgres, matrixDeclarationEnabled, type MatrixEnv, type MatrixLogger, type RowQuery } from './declare-schema';

export const MATRIX_APP = 'crucible';

function matrixLogger(): MatrixLogger {
  const l = appLog.child({ component: 'matrix' });
  return { info: (m) => l.info(m), warn: (m) => l.warn(m) };
}

/**
 * Declares Crucible's schema to Matrix in the background: returns at once and never rejects (a failure is a warning). Only
 * when the declaration has somewhere to go (MATRIX_URL or MATRIX_DECLARATIONS_DIR): the tests send nothing. Returns the
 * pending declaration (tests), or null when nothing is declared.
 */
export function declareCrucibleSchema(query: RowQuery, opts: { env?: MatrixEnv; log?: MatrixLogger } = {}): Promise<void> | null {
  const env = opts.env ?? process.env;
  if (!matrixDeclarationEnabled(env)) return null;
  const log = opts.log ?? matrixLogger();
  const pending = introspectPostgres(query)
    .then((tables) => declareSchema({ app: MATRIX_APP, version: env.APP_VERSION?.trim() || null, tables, env, log }))
    .then(() => undefined, (e: unknown) => log.warn?.(`[matrix] schema of ${MATRIX_APP} not read: ${e instanceof Error ? e.message : String(e)}`));
  void pending;
  return pending;
}
