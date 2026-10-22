import 'server-only';
// State of the connectors (delivery 3): for each pub_ view Crucible reads or publishes, whether it exists on this server and
// whether Crucible's role may read it. Read from the catalogue (pg_class), never by reading the view: a view that does not
// exist yet, or that Matrix has not granted, is a state, not an error.
import { sql } from 'drizzle-orm';
import { PUBLISHED_VIEWS, READ_CONNECTORS } from '@/config/connectors';
import { getDb } from '@/server/db/client';

export type ConnectorState = 'readable' | 'not_granted' | 'absent';

export async function connectorStates(): Promise<Map<string, ConnectorState>> {
  const db = await getDb();
  const views = [...READ_CONNECTORS, ...PUBLISHED_VIEWS].map((c) => c.view);
  const res = await db.execute(sql`
    select n.nspname || '.' || c.relname as view,
           has_schema_privilege(n.oid, 'USAGE') and has_table_privilege(c.oid, 'SELECT') as readable
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname || '.' || c.relname in (${sql.join(views.map((v) => sql`${v}`), sql`, `)})`);
  const found = new Map((res.rows as { view: string; readable: boolean }[]).map((r) => [r.view, r.readable]));
  return new Map(views.map((v) => [v, !found.has(v) ? 'absent' : found.get(v) ? 'readable' : 'not_granted']));
}
