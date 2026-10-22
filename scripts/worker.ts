// npm run worker — the scheduled jobs of Crucible (src/server/jobs): checks every minute which job is due and runs it; several
// workers may run, a lease keeps each job to one of them. Stops cleanly on SIGTERM / SIGINT (between two runs).
//   npx tsx --conditions=react-server scripts/worker.ts
import { loadEnvFiles } from '@/server/config/env-files';

async function main(): Promise<void> {
  loadEnvFiles(process.cwd());
  const { assertValidConfig } = await import('@/server/config');
  const { DatabaseNotConfiguredError } = await import('@/server/db/client');
  const { openPostgres } = await import('@/server/db/postgres');
  const { crucibleJobs } = await import('@/server/jobs/registry');
  const { runDueJobs } = await import('@/server/jobs/runner');
  const { log } = await import('@/server/log');
  const { config } = assertValidConfig({ strict: true });
  if (!config.database) throw new DatabaseNotConfiguredError();
  const h = await openPostgres({ url: config.database.url, poolMax: 2, applicationName: 'crucible-worker' });
  const jobs = crucibleJobs(h);
  log.info('Crucible worker started', { component: 'jobs', jobs: jobs.filter((j) => j.enabled).map((j) => j.name) });
  let stopping = false;
  const stop = () => (stopping = true);
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  while (!stopping) {
    await runDueJobs(h.db, jobs).catch((e) => log.error('Job round failed', { component: 'jobs', err: e }));
    for (let i = 0; i < 60 && !stopping; i++) await new Promise((r) => setTimeout(r, 1000));
  }
  await h.close();
  log.info('Crucible worker stopped', { component: 'jobs' });
}

main().then(
  () => process.exit(0),
  async (e) => {
    const { logError } = await import('@/server/log');
    logError('worker', e, { component: 'jobs' });
    process.exit(1);
  },
);
