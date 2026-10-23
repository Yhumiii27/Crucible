// Delivery 5b on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): what waits for each profile's
// decision, the global search of the header under the visibility rules (U-3), and the CSV export of a screen (rights re-checked,
// masks applied). The business clock follows the (fake) system time, Thu 22 Oct 2026.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { REAL_CLOCK } from '@/domain/clock';
import { parisInstant } from '@/lib/dates';
import { GET as exportGet } from '@/app/api/export/[screen]/route';
import { searchAction } from '@/server/actions/search';
import { setClockForTests } from '@/server/clock';
import { decisionQueue } from '@/server/dal/decisions';
import { getViewer } from '@/server/session';
import { testDatabase, type TestDatabase } from '@/test/db';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase();
  setClockForTests(REAL_CLOCK);
});
afterAll(async () => {
  setClockForTests(null);
  await t.close();
});
beforeEach(() => {
  jar.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(parisInstant('2026-10-22', '11:00'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const queueOf = async (role: string) => {
  as(role);
  return decisionQueue(await getViewer());
};
const exportOf = async (role: string, screen: string, query = '') => {
  as(role);
  return exportGet(new Request(`http://localhost/api/export/${screen}${query}`), { params: Promise.resolve({ screen }) });
};

describe('to decide', () => {
  it('the coordinator: the PDE conflict, the lot of proposals of the demo run, the need it could not place', async () => {
    const q = await queueOf('coordinator');
    expect(q.items.map((i) => [i.kind, i.ref])).toEqual([['conflict', 'C-2026-0001'], ['proposals', 'R-2026-0001'], ['unplaced', 'N-2026-0001']]);
    expect(q).toMatchObject({ openProposals: 4, openConflicts: 1 });
    // The confidential project of the conflict stays masked for the coordinator (U-3).
    const conflict = q.items[0];
    expect(conflict.kind === 'conflict' && conflict.needs).toEqual(['N-2026-0003', 'N-2026-0002 · RD-VEGA']);
  });

  it('the safety officer: the open conflict sheets only (to veto); a project lead and a partner: nothing', async () => {
    expect((await queueOf('safety')).items.map((i) => i.kind)).toEqual(['conflict']);
    expect((await queueOf('project_lead')).items).toEqual([]);
    expect((await queueOf('partner')).items).toEqual([]);
  });
});

describe('global search (U-3)', () => {
  it('the coordinator finds the PDE and its zones; a booking of a confidential project by its reference only', async () => {
    as('coordinator');
    const pde = await searchAction('PDE');
    expect(pde.filter((h) => h.kind === 'Facility').map((h) => h.href)).toEqual(['/facilities/PDE']);
    expect(pde.filter((h) => h.kind === 'Resource').map((h) => h.title.split(' · ')[0]).sort()).toEqual(['PDE-ATM', 'PDE-LAB', 'PDE-PIL']);
    expect(await searchAction('B-2026-0012')).toEqual([{ kind: 'Booking', title: 'B-2026-0012', sub: 'PDE-LAB', href: '/planning?week=2026-10-26' }]);
  });

  it('the partner of EPC France finds nothing of the PDE, nor its bookings; short or odd input finds nothing', async () => {
    as('partner');
    expect(await searchAction('PDE')).toEqual([]);
    expect(await searchAction('B-2026-0011')).toEqual([]);
    expect((await searchAction('LAB67')).some((h) => h.href === '/facilities/LAB67')).toBe(true);
    expect(await searchAction('P')).toEqual([]);
    expect(await searchAction(42)).toEqual([]);
    as('admin');
    expect(await searchAction('PDE')).toEqual([]);
  });
});

describe('CSV export of a screen', () => {
  it('the proposals of the latest run, in French, semicolon-separated; a confidential project masked', async () => {
    const res = await exportOf('coordinator', 'propose');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="crucible-propose-2026-10-22.csv"');
    const lines = (await res.text()).replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Passage;Besoin;Projet;Moyen;Du;Au;Retard (jours ouvrés);État');
    expect(lines).toHaveLength(5);
    expect(lines.find((l) => l.includes('N-2026-0003'))).toContain('Projet non visible');
  });

  it('a screen outside the profile’s workspace, or without an export, is not found', async () => {
    expect((await exportOf('project_lead', 'propose')).status).toBe(404);
    expect((await exportOf('coordinator', 'people')).status).toBe(404);
    expect((await exportOf('coordinator', '..')).status).toBe(404);
  });

  it('the planning week of the partner: laboratoire 67 only, other entities’ tests without their purpose', async () => {
    const text = await (await exportOf('partner', 'planning', '?week=2026-10-26')).text();
    expect(text).not.toContain('PDE-');
    expect(text).toContain('LAB67-CLIM');
    expect(text).not.toContain('RD-ORION');
  });
});
