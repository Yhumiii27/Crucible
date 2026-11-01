// State of the Codex references typed in Crucible (S-6, CX-1, CR-060): protocols of the needs, reports of the tests, risk analyses
// of the rules, justifications of the substitutions. Codex hosts every document; Crucible keeps only the reference and reads
// `codex.pub_documents` (id, former numbers, state, revision in force) to say whether it is in force. Never the title: a
// document's confidentiality is Codex's (D10), and the reference is all Crucible needs. Pure: no import.

export interface CodexDoc {
  id: string;
  /** Former numbers (legacy system, migration). */
  aliases: string[];
  /** `active`, `obsolete` or `archived`. */
  state: string;
  /** Letter of the revision in force (A, B…), null before the first approval. */
  revInForce: string | null;
}

export type CodexRefStatus = 'in_force' | 'no_revision' | 'obsolete' | 'archived' | 'unknown';

/** A reference as Codex compares it: trimmed, upper case. */
export const codexKey = (ref: string) => ref.trim().toUpperCase();

/** The document a reference names, by its id or a former number. */
export function findCodexDoc(ref: string, docs: readonly CodexDoc[]): CodexDoc | undefined {
  const k = codexKey(ref);
  return docs.find((d) => codexKey(d.id) === k) ?? docs.find((d) => d.aliases.some((a) => codexKey(a) === k));
}

export function codexRefStatus(doc: CodexDoc | undefined): CodexRefStatus {
  if (!doc) return 'unknown';
  if (doc.state === 'archived') return 'archived';
  if (doc.state === 'obsolete') return 'obsolete';
  return doc.revInForce ? 'in_force' : 'no_revision';
}

/** What to show next to a reference (EN source string), and whether it needs attention. */
export function codexRefNote(doc: CodexDoc | undefined): { label: string; warn: boolean } {
  const st = codexRefStatus(doc);
  switch (st) {
    case 'in_force':
      return { label: `rev. ${doc!.revInForce} in force`, warn: false };
    case 'no_revision':
      return { label: 'No revision in force in Codex', warn: true };
    case 'obsolete':
      return { label: 'Obsolete in Codex', warn: true };
    case 'archived':
      return { label: 'Archived in Codex', warn: true };
    default:
      return { label: 'Unknown in Codex', warn: true };
  }
}
