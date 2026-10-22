import 'server-only';
// Crucible's scheduled jobs: the schema backup (when CRUCIBLE_BACKUP_DIR is set) and the daily schema declaration to Matrix (when
// MATRIX_URL or MATRIX_DECLARATIONS_DIR is set), and the daily run of the proposal engine (F-3: it proposes every day, a
// person confirms). Other business jobs (reminders, snapshots) come with their deliveries.
import path from 'node:path';
import { backupSchema } from '@/server/backup';
import { getConfig } from '@/server/config';
import { declareCrucibleSchema } from '@/server/integrations/matrix';
import { matrixDeclarationEnabled } from '@/server/integrations/matrix/declare-schema';
import type { PostgresHandle } from '@/server/db/postgres';
import { businessNow, businessToday } from '@/server/clock';
import { runEngine } from '@/server/planning/engine-run';
import type { Job } from './runner';

export function crucibleJobs(h: PostgresHandle): Job[] {
  const cfg = getConfig();
  return [
    {
      name: 'backup',
      everyMin: cfg.backup.everyMin,
      enabled: !!cfg.backup.dir && !!cfg.database,
      async run() {
        const r = await backupSchema({ databaseUrl: cfg.database!.url, dir: cfg.backup.dir!, retentionDays: cfg.backup.retentionDays });
        return `${path.basename(r.file)}${r.deleted.length ? `, ${r.deleted.length} expired removed` : ''}`;
      },
    },
    {
      name: 'matrix-declare',
      everyMin: 1440,
      enabled: matrixDeclarationEnabled(process.env),
      async run() {
        await declareCrucibleSchema((q) => h.pool.query(q).then((r) => r.rows as Record<string, unknown>[]));
      },
    },
    {
      name: 'plan-nightly',
      everyMin: 1440,
      enabled: !!cfg.database,
      async run() {
        const [today, now] = await Promise.all([businessToday(), businessNow()]);
        const r = await h.db.transaction((tx) => runEngine(tx, { trigger: 'nightly', by: { name: 'Crucible (nightly run)', userId: null, role: null }, today, now }));
        return `${r.ref}: ${r.result.proposals.length} proposals, ${r.conflicts} conflicts`;
      },
    },
  ];
}
