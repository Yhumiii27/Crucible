import { describe, expect, it } from 'vitest';
import { backupFileName, backupInstant, expiredBackups } from './backup';

describe('backups', () => {
  it('names a file by its UTC instant and reads it back', () => {
    const at = new Date('2026-10-22T08:15:30.123Z');
    expect(backupFileName(at)).toBe('crucible-20261022T081530Z.dump');
    expect(backupInstant('crucible-20261022T081530Z.dump')?.toISOString()).toBe('2026-10-22T08:15:30.000Z');
    expect(backupInstant('notes.txt')).toBeNull();
  });

  it('deletes what is older than the retention, never the newest backup, never other files', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    const names = ['crucible-20261001T000000Z.dump', 'crucible-20261010T000000Z.dump', 'crucible-20261021T000000Z.dump', 'README.txt'];
    expect(expiredBackups(names, now, 14)).toEqual(['crucible-20261001T000000Z.dump']);
    expect(expiredBackups(['crucible-20250101T000000Z.dump'], now, 14)).toEqual([]);
  });
});
