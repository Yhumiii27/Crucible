import 'server-only';
// Scheduled jobs (derived from Keystone's src/server/jobs): each job runs every `everyMin` minutes, on one runner at a time —
// a lease row in job_runs is claimed by a single UPDATE (atomic), so several workers or server instances never run the same
// job at once; a crashed run frees its lease when the lease expires. A failure is logged and recorded, never thrown.
import { sql } from 'drizzle-orm';
import type { DB } from '@/server/db/types';
import { logError, log } from '@/server/log';

export interface Job {
  name: string;
  everyMin: number;
  /** False: never run (its setting is off). */
  enabled: boolean;
  run(): Promise<string | void>;
}

/** Longest a run may hold its lease before another runner may take the job again. */
export const LEASE_MIN = 30;

/** Claims a due job: true when this runner got it. */
async function claim(db: DB, job: Job, now: Date): Promise<boolean> {
  await db.execute(sql`insert into crucible.job_runs (name) values (${job.name}) on conflict (name) do nothing`);
  const r = await db.execute(sql`
    update crucible.job_runs set lease_until = ${new Date(now.getTime() + LEASE_MIN * 60_000)}, last_started_at = ${now}
    where name = ${job.name}
      and (lease_until is null or lease_until < ${now})
      and (last_started_at is null or last_started_at <= ${new Date(now.getTime() - job.everyMin * 60_000)})
    returning name`);
  return r.rows.length === 1;
}

/** Runs every enabled job that is due and not leased elsewhere; returns the names of the jobs run. */
export async function runDueJobs(db: DB, jobs: readonly Job[], now = new Date()): Promise<string[]> {
  const ran: string[] = [];
  for (const job of jobs) {
    if (!job.enabled || !(await claim(db, job, now))) continue;
    ran.push(job.name);
    let status: 'ok' | 'error' = 'ok';
    let error: string | null = null;
    try {
      const summary = await job.run();
      log.info(`Job ${job.name} done`, { component: 'jobs', job: job.name, summary: summary ?? undefined });
    } catch (e) {
      status = 'error';
      error = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
      logError(`Job ${job.name}`, e, { component: 'jobs' });
    }
    await db.execute(sql`update crucible.job_runs set lease_until = null, last_finished_at = ${new Date()}, last_status = ${status}, last_error = ${error} where name = ${job.name}`);
  }
  return ran;
}
