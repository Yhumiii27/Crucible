import 'server-only';
// Seed of an empty database (copied from Keystone, R-011): `demo` (default) loads the demonstration data set, `production`
// nothing but the seed record (the reference data — entities, sites, facilities, projects — are entered by the
// administrator and the R&D director, or come from Matrix later). An already seeded database is left as it is.
import type { SeedMode } from '@/server/config/parse';
import { log } from '@/server/log';
import type { DB } from '../types';
import { seedDemo } from './demo';
import { readSeedRecord, writeSeedRecord } from './mode';

/** Seeds the database when it has no seed record; returns true when it did. */
export async function seedIfEmpty(db: DB, opts: { mode?: SeedMode } = {}): Promise<boolean> {
  const mode = opts.mode ?? 'demo';
  return db.transaction(async (tx) => {
    if (await readSeedRecord(tx)) return false;
    if (mode === 'demo') await seedDemo(tx);
    await writeSeedRecord(tx, mode);
    log.info('Database seeded', { component: 'db', seed: mode });
    return true;
  });
}
