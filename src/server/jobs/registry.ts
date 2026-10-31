import 'server-only';
// Crucible's scheduled jobs: the schema backup (when CRUCIBLE_BACKUP_DIR is set) and the daily schema declaration to Matrix (when
// MATRIX_URL or MATRIX_DECLARATIONS_DIR is set), the hourly read of the other tools' views (CR-060), and the daily run of the
// proposal engine (F-3: it proposes every day, a person confirms), and from delivery 5 the e-mails of the notifications, the
// arbitration reminders, the weekly recap and the weekly snapshots of the utilisation.
import path from 'node:path';
import { backupSchema } from '@/server/backup';
import { getConfig } from '@/server/config';
import { readConnectors, reportLine } from '@/server/integrations/connectors';
import { declareCrucibleSchema } from '@/server/integrations/matrix';
import { matrixDeclarationEnabled } from '@/server/integrations/matrix/declare-schema';
import type { PostgresHandle } from '@/server/db/postgres';
import { businessNow, businessToday } from '@/server/clock';
import { remindOverdueArbitrations, weeklyRecap } from '@/server/notify/jobs';
import { sendPendingMail } from '@/server/notify/mail';
import { runEngine } from '@/server/planning/engine-run';
import { computeWeeklySnapshots } from '@/server/planning/snapshots';
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
      // CR-060: Keystone milestones, Cursus absences and Vigie inspections, once their views are granted.
      name: 'connectors-read',
      everyMin: 60,
      enabled: !!cfg.database,
      async run() {
        const reports = await h.db.transaction((tx) => readConnectors(tx, { name: 'Crucible (connectors)', userId: null, role: null }));
        return reports.map(reportLine).join('; ');
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
    {
      // F-8: the e-mails of the notifications, when a transport is set.
      name: 'notify-mail',
      everyMin: 5,
      enabled: !!cfg.database && cfg.mail.transport !== 'none',
      async run() {
        return `${await sendPendingMail(h.db, { ...cfg.mail, baseUrl: cfg.publicUrl })} e-mails`;
      },
    },
    {
      // A-6: reminders of the arbitrations past their due date.
      name: 'arbitration-reminders',
      everyMin: 1440,
      enabled: !!cfg.database,
      async run() {
        return `${await remindOverdueArbitrations(h.db, await businessToday())} reminders`;
      },
    },
    {
      // F-8: the weekly recap of the tests of the next two weeks.
      name: 'weekly-recap',
      everyMin: 10080,
      enabled: !!cfg.database,
      async run() {
        return `${await weeklyRecap(h.db, await businessToday())} recaps`;
      },
    },
    {
      // X-4: the weekly snapshots of the utilisation, once each week is over.
      name: 'weekly-snapshots',
      everyMin: 1440,
      enabled: !!cfg.database,
      async run() {
        return `${await computeWeeklySnapshots(h.db, await businessToday())} rows`;
      },
    },
  ];
}
