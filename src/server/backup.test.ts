// Backup and restore of the `crucible` schema with the real pg_dump / pg_restore, as crucible_app (no right to create a schema).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEntries, entities } from '@/server/db/schema';
import { writeAudit } from '@/server/db/helpers';
import { testDatabase, type TestDatabase } from '@/test/db';
import { backupSchema, restoreSchema, splitCredentials } from './backup';

let t: TestDatabase;
let dir: string;
beforeAll(async () => {
  t = await testDatabase();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crucible-backup-'));
});
afterAll(async () => {
  await t.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('backup and restore', () => {
  it('keeps the password off the command line', () => {
    expect(splitCredentials('postgres://crucible_app:s%40cret@db:5432/epc2i')).toEqual({ url: 'postgres://crucible_app@db:5432/epc2i', password: 's@cret' });
  });

  it('dumps the schema, prunes old backups, and restores the data as it was', async () => {
    fs.writeFileSync(path.join(dir, 'crucible-20200101T000000Z.dump'), 'old');
    await writeAudit(t.db, { actorName: 'System', actorUserId: null, objectRef: 'Test', change: 'before backup', area: 'Tests' });
    const { file, deleted } = await backupSchema({ databaseUrl: t.url, role: t.role, dir, retentionDays: 14, now: new Date('2026-10-22T08:00:00Z') });
    expect(path.basename(file)).toBe('crucible-20261022T080000Z.dump');
    expect(deleted).toEqual(['crucible-20200101T000000Z.dump']);
    expect(fs.statSync(file).size).toBeGreaterThan(1000);

    await t.db.insert(entities).values({ code: 'TMP', name: 'Created after the backup', kind: 'partner' });
    await restoreSchema({ databaseUrl: t.url, role: t.role, file });
    expect(await t.db.$count(entities, eq(entities.code, 'TMP'))).toBe(0);
    expect(await t.db.$count(entities)).toBe(2);
    expect(await t.db.$count(auditEntries, eq(auditEntries.change, 'before backup'))).toBe(1);
    // The append-only trigger came back with the table.
    await expect(t.handle.pool.query(`delete from crucible.audit_entries`)).rejects.toThrow(/append-only/);
  });
});
