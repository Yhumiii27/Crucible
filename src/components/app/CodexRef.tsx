// A Codex reference typed in Crucible, with what Codex says of it (CR-060): the revision in force, or a warning when the document
// is unknown, obsolete, archived or has no revision in force. Without a readable `codex.pub_documents`, the reference alone.
import { Tag } from '@/components/ds/Tag';
import { codexRefNote } from '@/domain/codex';
import type { T } from '@/i18n/translate';
import type { CodexLookup } from '@/server/dal/codex';

export function CodexRef({ refText, lookup, t }: { refText: string; lookup: CodexLookup; t: T }) {
  if (!lookup) return <>{refText}</>;
  const note = codexRefNote(lookup(refText));
  return (
    <>
      {refText} <Tag size="xs" tone={note.warn ? 'accent' : 'outline'}>{t(note.label)}</Tag>
    </>
  );
}
