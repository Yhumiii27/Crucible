// Backups of the `crucible` schema (pg_dump, custom format): file names and retention. Pure. On the shared EPC2I server the
// nightly backup of Matrix also covers the schema once it lists Crucible (docs/DEMANDES-MATRIX.md M-7); these backups serve the
// Coolify kit's own PostgreSQL and on-demand copies before an upgrade.

export const BACKUP_DEFAULTS = { everyMin: 1440, retentionDays: 14, minEveryMin: 15 } as const;

const NAME_RE = /^crucible-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump$/;

/** "crucible-20261022T081500Z.dump" for the instant `at`. */
export function backupFileName(at: Date): string {
  return `crucible-${at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}.dump`;
}

/** The instant a backup file name carries, or null for another file. */
export function backupInstant(name: string): Date | null {
  const m = NAME_RE.exec(name);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

/** Backup files older than the retention, to delete; the newest backup is always kept. Other files are ignored. */
export function expiredBackups(names: readonly string[], now: Date, retentionDays: number): string[] {
  const dated = names.map((n) => ({ n, at: backupInstant(n) })).filter((x): x is { n: string; at: Date } => !!x.at).sort((a, b) => b.at.getTime() - a.at.getTime());
  const limit = now.getTime() - retentionDays * 86_400_000;
  return dated.slice(1).filter((x) => x.at.getTime() < limit).map((x) => x.n);
}
