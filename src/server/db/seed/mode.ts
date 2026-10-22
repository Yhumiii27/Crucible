// Seed of a database (copied from Keystone, R-011): which data set it was created with, recorded in app_settings when it
// is seeded — demo (the demonstration data set, the default of development, tests and demonstrations) or production
// (reference data only). The record follows the data, not the environment: a database keeps the seed it was created with
// whatever CRUCIBLE_SEED says later.
import { eq } from 'drizzle-orm';
import type { SeedMode } from '@/server/config/parse';
import { appSettings } from '../schema';
import type { DB, Tx } from '../types';

type Q = DB | Tx;

export const SEED_SETTING_KEY = 'crucible.seed';

export interface SeedRecord {
  mode: SeedMode;
  /** ISO instant of the seed. */
  seededAt: string;
}

const isSeedMode = (v: unknown): v is SeedMode => v === 'demo' || v === 'production';

/** The recorded seed, or null (not seeded yet). */
export async function readSeedRecord(q: Q): Promise<SeedRecord | null> {
  const [row] = await q.select({ v: appSettings.value }).from(appSettings).where(eq(appSettings.key, SEED_SETTING_KEY));
  const v = row?.v as Partial<SeedRecord> | undefined;
  return v && isSeedMode(v.mode) ? { mode: v.mode, seededAt: typeof v.seededAt === 'string' ? v.seededAt : '' } : null;
}

/** Records the seed of the database (in the seeding transaction). */
export async function writeSeedRecord(q: Q, mode: SeedMode, at = new Date()): Promise<void> {
  const value: SeedRecord = { mode, seededAt: at.toISOString() };
  await q.insert(appSettings).values({ key: SEED_SETTING_KEY, value, updatedAt: at, updatedByName: 'System' })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: at, updatedByName: 'System' } });
}

/** The data set of the database: its record, else demo. */
export async function databaseSeedMode(q: Q): Promise<SeedMode> {
  return (await readSeedRecord(q))?.mode ?? 'demo';
}
