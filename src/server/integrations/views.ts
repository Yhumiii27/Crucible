import 'server-only';
import { sql } from 'drizzle-orm';
import type { DB, Tx } from '@/server/db/types';
// The pub_ views of the other tools Crucible reads (M-17: reads through pub_ views only), and what each read reports.

export const READ_VIEWS = ['keystone.pub_projets', 'keystone.pub_jalons', 'cursus.pub_salaries', 'cursus.pub_absences', 'vigie.pub_controles', 'matrix.pub_sites', 'matrix.pub_filiales', 'vigie.pub_suspensions_essais'] as const;
export type ReadView = (typeof READ_VIEWS)[number];

export interface ReadReport {
  view: ReadView;
  /** false: the view is not published or not granted to Crucible yet. */
  readable: boolean;
  /** Rows of the view about Crucible's projects, people or resources. */
  read: number;
  added: number;
  changed: number;
  removed: number;
  /** Rows read but not usable (undated milestone, control without a last date or a period, milestone a need still serves). */
  skipped: number;
}

export interface ReadBy {
  name: string;
  userId: string | null;
  role: string | null;
}

/** Whether crucible_app may read `schema.view` (catalogue only: never reads the view itself). */
export async function viewReadable(tx: DB | Tx, qualified: string): Promise<boolean> {
  const [schema, name] = qualified.split('.');
  const r = await tx.execute(sql`
    select coalesce(bool_and(has_schema_privilege(n.oid, 'USAGE') and has_table_privilege(c.oid, 'SELECT')), false) as ok
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ${schema} and c.relname = ${name}`);
  return !!(r.rows[0] as { ok: boolean } | undefined)?.ok;
}

export const emptyReport = (view: ReadView, readable: boolean): ReadReport => ({ view, readable, read: 0, added: 0, changed: 0, removed: 0, skipped: 0 });
export const sqlList = (values: readonly string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);

/** One line per view, for the job log and the screen. */
export const reportLine = (r: ReadReport) =>
  r.readable ? `${r.view}: ${r.read} read, ${r.added} added, ${r.changed} changed, ${r.removed} removed${r.skipped ? `, ${r.skipped} skipped` : ''}` : `${r.view}: not readable`;
