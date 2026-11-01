// The monthly report (CR-077, X-16) on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): the
// utilisation per resource of the visible facilities only, the bookings of the month masked (U-3), and the header's Export as
// CSV and JSON. The business clock follows the (fake) system time, Thu 22 Oct 2026.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { GET as exportGet } from '@/app/api/export/[screen]/route';
import { REAL_CLOCK } from '@/domain/clock';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { monthlyReport } from '@/server/dal/report';
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
const exportOf = async (role: string, query: string) => {
  as(role);
  return exportGet(new Request(`http://localhost/api/export/report${query}`), { params: Promise.resolve({ screen: 'report' }) });
};

describe('monthly report', () => {
  it('the R&D director: both facilities, a line per resource, totals, the bookings of October', async () => {
    as('rd_director');
    const r = await monthlyReport(await getViewer(), '2026-10', null);
    expect(r.byFacility.map((f) => f.code)).toEqual(['LAB67', 'PDE']);
    const pde = r.byFacility.find((f) => f.code === 'PDE')!;
    expect(pde.lines.map((l) => l.code).sort()).toEqual(['PDE-ATM', 'PDE-LAB', 'PDE-PIL']);
    expect(pde.total.netOpenHours).toBeGreaterThan(0);
    expect(pde.total.bookedHours).toBeCloseTo(pde.lines.reduce((s, l) => s + l.bookedHours, 0), 0);
    expect(r.bookings.length).toBeGreaterThan(0);
    expect(r.bookings.every((b) => b.status !== 'requested')).toBe(true);
  });

  it('the EPC France partner: laboratoire 67 only, other entities’ projects masked', async () => {
    as('partner');
    const r = await monthlyReport(await getViewer(), '2026-10', null);
    expect(r.byFacility.map((f) => f.code)).toEqual(['LAB67']);
    expect(r.bookings.filter((b) => b.entityCode !== 'EPCFR').every((b) => b.projectCode === null)).toBe(true);
    // A facility it does not see gives nothing.
    expect((await monthlyReport(await getViewer(), '2026-10', 'PDE')).byFacility).toEqual([]);
  });

  it('the Export: CSV, then JSON for a BI tool; refused outside the workspace', async () => {
    const csv = await exportOf('rd_director', '?month=2026-10&facility=PDE');
    expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    const lines = (await csv.text()).trim().split('\r\n');
    expect(lines[0].replace(/^\uFEFF/, '')).toBe('Mois;Installation;Moyen;Heures ouvertes;Heures réservées;Réservé (%);Heures réalisées;Réalisé (%);Heures bloquées;Bloqué (%);Non tenue');
    expect(lines).toHaveLength(4);
    const json = await exportOf('rd_director', '?month=2026-10&facility=PDE&format=json');
    expect(json.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const rows = (await json.json()) as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ Mois: '2026-10', Installation: 'PDE' });
    expect((await exportOf('technician', '?month=2026-10')).status).toBe(404);
  });
});
