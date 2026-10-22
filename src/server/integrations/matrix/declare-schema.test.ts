// Schema declaration to Matrix (copied from Keystone): introspection of a real PostgreSQL schema, the matrix.schema/1 document, the POST, never-throws.
// {MATRIX_URL}/api/declarations, and nothing read or sent without MATRIX_URL.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testDatabase, type TestDatabase } from '@/test/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { declareSchema, introspectPostgres, schemaDocument, type MatrixTable } from './declare-schema';
import { declareCrucibleSchema } from './index';

let t: TestDatabase;
const query = (sql: string) => t.handle.pool.query(sql).then((r) => r.rows as Record<string, unknown>[]);
const silent = { info: vi.fn(), warn: vi.fn() };

beforeAll(async () => {
  t = await testDatabase({ migrate: false, useAsDefault: false });
  await t.handle.pool.query(`
    create type status as enum ('open', 'closed');
    create table people (id text primary key, email text not null unique, tags text[]);
    create table orders (
      project text not null, seq integer not null, owner_id text references people(id) on delete set null,
      status status not null default 'open', primary key (project, seq));
    create table "__drizzle_migrations" (id serial primary key, hash text);`);
});
afterAll(async () => t.close());

describe('Matrix schema declaration', () => {
  it('reads the tables, columns, keys, links and uniques, without the migrations table', async () => {
    const tables = await introspectPostgres(query);
    expect(tables.map((t) => t.name).sort()).toEqual(['orders', 'people']);
    const people = tables.find((t) => t.name === 'people')!;
    expect(people.pk).toEqual(['id']);
    expect(people.uniques).toEqual([['email']]);
    expect(people.columns).toEqual([
      { name: 'id', type: 'text', nullable: false, pk: true, default: null },
      { name: 'email', type: 'text', nullable: false, pk: false, default: null },
      { name: 'tags', type: 'text[]', nullable: true, pk: false, default: null },
    ]);
    const orders = tables.find((t) => t.name === 'orders')!;
    expect(orders.pk).toEqual(['project', 'seq']);
    expect(orders.columns.every((c) => !c.pk)).toBe(true); // a composite key marks no single column
    expect(orders.columns.find((c) => c.name === 'status')).toMatchObject({ type: 'status', default: "'open'::status" });
    expect(orders.fks).toEqual([{ columns: ['owner_id'], table: 'people', refColumns: ['id'], onDelete: 'set null', declared: true }]);
  });

  it('builds a matrix.schema/1 document whose fingerprint depends on the schema only', async () => {
    const tables = await introspectPostgres(query);
    const a = schemaDocument({ app: 'crucible', tables, now: new Date('2026-10-17T08:00:00Z') });
    const b = schemaDocument({ app: 'crucible', version: '9.0', tables: [...tables].reverse() });
    expect(a).toMatchObject({ schema: 'matrix.schema/1', app: 'crucible', version: null, declareLe: '2026-10-17T08:00:00.000Z' });
    expect(a.tables.map((t) => t.name)).toEqual(['orders', 'people']);
    expect(a.empreinte).toMatch(/^[0-9a-f]{16}$/);
    expect(b.empreinte).toBe(a.empreinte);
    const changed: MatrixTable[] = tables.map((t) => (t.name === 'people' ? { ...t, uniques: [] } : t));
    expect(schemaDocument({ app: 'crucible', tables: changed }).empreinte).not.toBe(a.empreinte);
  });

  it('posts to {MATRIX_URL}/api/declarations with the token, URL credentials as Basic', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ nouvellesTables: ['orders'] }));
    const log = { info: vi.fn(), warn: vi.fn() };
    const tables = await introspectPostgres(query);
    const env = { MATRIX_URL: 'https://bot:p%40ss@matrix.example.internal/', MATRIX_TOKEN: 'tok' };
    const doc = await declareSchema({ app: 'crucible', tables, env, log, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://matrix.example.internal/api/declarations');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'content-type': 'application/json', 'x-matrix-token': 'tok', authorization: `Basic ${Buffer.from('bot:p@ss').toString('base64')}`,
    });
    expect(JSON.parse(String(init.body))).toEqual(doc);
    expect(log.info).toHaveBeenCalledWith('[matrix] new tables declared: orders');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('never throws: a refusal or an unreachable Matrix is a warning', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const refused = vi.fn(async () => new Response('bad token', { status: 401 }));
    await expect(declareSchema({ app: 'crucible', tables: [], env: { MATRIX_URL: 'http://localhost:1' }, log, fetchImpl: refused as unknown as typeof fetch })).resolves.toMatchObject({ app: 'crucible' });
    expect(log.warn).toHaveBeenLastCalledWith('[matrix] schema declaration of crucible not sent: Matrix answered 401: bad token');
    const down = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    await declareSchema({ app: 'crucible', tables: [], env: { MATRIX_URL: 'http://localhost:1' }, log, fetchImpl: down as unknown as typeof fetch });
    expect(log.warn).toHaveBeenLastCalledWith('[matrix] schema declaration of crucible not sent: ECONNREFUSED');
  });

  it('writes the declaration to MATRIX_DECLARATIONS_DIR', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ks-matrix-'));
    try {
      const fetchImpl = vi.fn();
      const doc = await declareSchema({ app: 'crucible', tables: [], env: { MATRIX_DECLARATIONS_DIR: dir }, log: silent, fetchImpl });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(JSON.parse(readFileSync(join(dir, 'crucible.json'), 'utf8'))).toEqual(doc);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads and sends nothing without MATRIX_URL nor MATRIX_DECLARATIONS_DIR', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const q = vi.fn(query);
    try {
      expect(declareCrucibleSchema(q, { env: {} })).toBeNull();
      expect(q).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('declares in the background with MATRIX_URL, version from APP_VERSION', async () => {
    const posted: unknown[] = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      posted.push(JSON.parse(String(init?.body)));
      return Response.json({ nouvellesTables: [] });
    });
    try {
      const pending = declareCrucibleSchema(query, { env: { MATRIX_URL: 'http://matrix.test', APP_VERSION: '1.0' }, log: silent });
      expect(pending).not.toBeNull();
      await pending;
      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({ schema: 'matrix.schema/1', app: 'crucible', version: '1.0' });
      expect((posted[0] as { tables: MatrixTable[] }).tables).toHaveLength(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
