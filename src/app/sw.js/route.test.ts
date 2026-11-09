// The service worker of the phones (CR-082): run in a stand-in of the worker's global scope.
import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

async function worker() {
  const handlers = new Map<string, (e: unknown) => void>();
  const deleted: string[] = [];
  const self = { location: { origin: 'https://crucible.test' }, addEventListener: (k: string, f: (e: unknown) => void) => handlers.set(k, f), skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  const caches = { delete: vi.fn(async (k: string) => void deleted.push(k)), keys: async () => [], open: vi.fn(), match: vi.fn() };
  new Function('self', 'caches', 'fetch', await GET().text())(self, caches, vi.fn());
  const fetchEvent = (method: string, path: string) => {
    const waited: Promise<unknown>[] = [];
    const responded = vi.fn();
    handlers.get('fetch')!({ request: { method, url: `https://crucible.test${path}`, mode: 'navigate' }, waitUntil: (p: Promise<unknown>) => waited.push(p), respondWith: responded });
    return { waited, responded };
  };
  return { fetchEvent, deleted };
}

describe('/sw.js', () => {
  it('drops the copies of the pages at sign-out, which is a POST', async () => {
    const w = await worker();
    const e = w.fetchEvent('POST', '/api/auth/sign-out');
    await Promise.all(e.waited);
    expect(w.deleted).toEqual(['crucible-pages-v1']);
    expect(e.responded).not.toHaveBeenCalled();
  });

  it('leaves the other writes to the network', async () => {
    const w = await worker();
    const e = w.fetchEvent('POST', '/my/schedule');
    expect(e.responded).not.toHaveBeenCalled();
    expect(w.deleted).toEqual([]);
  });
});
