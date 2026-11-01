import { describe, expect, it } from 'vitest';
import { codexRefNote, codexRefStatus, findCodexDoc, type CodexDoc } from './codex';

const docs: CodexDoc[] = [
  { id: 'PRO-RD-0012', aliases: ['PRT-PDE-007'], state: 'active', revInForce: 'B' },
  { id: 'PRO-RD-0013', aliases: [], state: 'active', revInForce: null },
  { id: 'ANR-PDE-0002', aliases: [], state: 'obsolete', revInForce: 'C' },
  { id: 'RAP-RD-0040', aliases: [], state: 'archived', revInForce: 'A' },
];

describe('Codex references', () => {
  it('found by id or former number, whatever the case and spaces', () => {
    expect(findCodexDoc(' pro-rd-0012 ', docs)?.id).toBe('PRO-RD-0012');
    expect(findCodexDoc('PRT-PDE-007', docs)?.id).toBe('PRO-RD-0012');
    expect(findCodexDoc('NOPE', docs)).toBeUndefined();
  });

  it('state and note', () => {
    expect(docs.map(codexRefStatus)).toEqual(['in_force', 'no_revision', 'obsolete', 'archived']);
    expect(codexRefStatus(undefined)).toBe('unknown');
    expect(codexRefNote(docs[0])).toEqual({ label: 'rev. B in force', warn: false });
    expect(codexRefNote(docs[2])).toEqual({ label: 'Obsolete in Codex', warn: true });
    expect(codexRefNote(undefined)).toEqual({ label: 'Unknown in Codex', warn: true });
  });
});
