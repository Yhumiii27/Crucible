// Codex references read from codex.pub_documents at display time (CR-060, S-6), on a fresh PostgreSQL database: nothing while
// the view is not published or not granted; then the documents named by their id or a former number, whatever the case.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codexLookup } from '@/server/dal/codex';
import { testDatabase, type TestDatabase } from '@/test/db';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase({ seed: null });
});
afterAll(async () => t.close());

const admin = async (q: string) => {
  const c = new pg.Client({ connectionString: t.url });
  await c.connect();
  try {
    await c.query(q);
  } finally {
    await c.end();
  }
};

describe('codexLookup', () => {
  it('null while codex.pub_documents is not published, then not granted', async () => {
    expect(await codexLookup(['PRO-RD-0012'])).toBeNull();
    await admin(`create schema codex;
      create view codex.pub_documents as select * from (values
        ('PRO-RD-0012', '["PRT-PDE-007"]'::jsonb, 'active', 'B', 'interne'),
        ('ANR-PDE-0002', '[]'::jsonb, 'obsolete', 'C', 'confidentiel')) v(id, aliases, state, rev_in_force, conf);`);
    expect(await codexLookup(['PRO-RD-0012'])).toBeNull();
  });

  it('once granted: by id or former number, case and spaces ignored; unknown is undefined', async () => {
    await admin(`grant usage on schema codex to ${t.role}; grant select on codex.pub_documents to ${t.role};`);
    const look = (await codexLookup(['pro-rd-0012', 'PRT-PDE-007 ', 'ANR-PDE-0002', 'NOPE', null]))!;
    expect(look).not.toBeNull();
    expect(look('pro-rd-0012')).toEqual({ id: 'PRO-RD-0012', aliases: ['PRT-PDE-007'], state: 'active', revInForce: 'B' });
    expect(look('PRT-PDE-007 ')?.id).toBe('PRO-RD-0012');
    expect(look('ANR-PDE-0002')?.state).toBe('obsolete');
    expect(look('NOPE')).toBeUndefined();
    // Nothing to look up: still readable, nothing found.
    expect((await codexLookup([]))!('PRO-RD-0012')).toBeUndefined();
  });
});
