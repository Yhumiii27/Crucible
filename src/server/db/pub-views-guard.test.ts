// Matrix decision M-18 (01 Nov 2026, Crucible's REQUESTS.md): Matrix defines and owns Crucible's pub_ views (screen
// "Publications", role matrix_gestion). The migrations that created them stay as they are (0002, 0005, 0009: a fresh local
// database still gets them), but no new migration creates, replaces, alters or drops a pub_ view — once Matrix has taken the
// views over, such a migration would fail ("must be owner of view") — and none drops or renames a column of a table a
// published view reads without asking Matrix first (the view depends on it). A new publication, or one more column, is asked
// of Matrix.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = path.join(process.cwd(), 'drizzle');
/** Migrations written before M-18 that create the pub_ views (kept as applied). */
const BEFORE_M18 = new Set(['0002_share_journal.sql', '0005_share_resources.sql', '0009_share_weekly.sql']);
/** Tables read by the published views (pub_journal, pub_moyens, pub_reservations, pub_occupation_hebdo). */
const PUBLISHED_TABLES = ['audit_entries', 'bookings', 'resources', 'facilities', 'projects', 'weekly_snapshots'];

const migrations = fs.readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

describe('pub_ views belong to Matrix (M-18)', () => {
  it('no migration but the three written before M-18 touches a pub_ view', () => {
    const view = /\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?VIEW\s+(IF\s+EXISTS\s+)?("?crucible"?\.)?"?pub_/i;
    const offenders = migrations.filter((f) => !BEFORE_M18.has(f) && view.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
    expect(offenders, 'ask Matrix for a publication instead (REQUESTS.md of Matrix, screen "Publications")').toEqual([]);
  });

  it('no migration drops or renames a column of a table a published view reads', () => {
    const offenders: string[] = [];
    for (const f of migrations) {
      const sqlText = fs.readFileSync(path.join(DIR, f), 'utf8');
      for (const t of PUBLISHED_TABLES) {
        const re = new RegExp(`ALTER\\s+TABLE\\s+("?crucible"?\\.)?"?${t}"?\\s+(DROP|RENAME)\\s+COLUMN`, 'i');
        if (re.test(sqlText)) offenders.push(`${f}: ${t}`);
      }
    }
    expect(offenders, 'tell Matrix first: a published column is never removed nor renamed (a _v2 view instead)').toEqual([]);
  });
});
