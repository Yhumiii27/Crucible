import 'server-only';
// Codex references (S-6, CX-1, CR-060): the documents Crucible's references name, read from `codex.pub_documents` at display time
// (nothing copied: Codex is the reference). Null while the view is not published or not granted to crucible_app — the screens
// then show the reference alone, as before.
import { sql } from 'drizzle-orm';
import { codexKey, findCodexDoc, type CodexDoc } from '@/domain/codex';
import { getDb } from '@/server/db/client';
import { viewReadable } from '@/server/integrations/connectors';

/** The document each reference names (undefined: unknown to Codex); null when Codex cannot be read. */
export type CodexLookup = ((ref: string) => CodexDoc | undefined) | null;

export async function codexLookup(refs: readonly (string | null | undefined)[]): Promise<CodexLookup> {
  const keys = [...new Set(refs.filter((r): r is string => !!r?.trim()).map(codexKey))];
  const db = await getDb();
  if (!(await viewReadable(db, 'codex.pub_documents'))) return null;
  const docs = keys.length
    ? ((await db.execute(sql`
        select id, coalesce(aliases, '[]'::jsonb) as aliases, state, rev_in_force from codex.pub_documents
        where upper(id) in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})
           or exists (select 1 from jsonb_array_elements_text(coalesce(aliases, '[]'::jsonb)) a where upper(a) in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)}))`)).rows as {
        id: string; aliases: string[]; state: string; rev_in_force: string | null;
      }[]).map((r) => ({ id: r.id, aliases: r.aliases ?? [], state: r.state, revInForce: r.rev_in_force }))
    : [];
  return (ref) => findCodexDoc(ref, docs);
}
