// The pilot on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): the R&D director sets it (audited),
// the checklist of the start is computed from what is recorded, the reference measure is compared with the pilot so far (X-2)
// under the visibility of the viewer (U-3). The business clock follows the (fake) system time, Thu 22 Oct 2026.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { desc, eq } from 'drizzle-orm';
import { REAL_CLOCK } from '@/domain/clock';
import { setPilotAction } from '@/features/pilot/actions';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { auditEntries } from '@/server/db/schema';
import { pilotComparison, pilotReadiness, rates, readPilot } from '@/server/dal/pilot';
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
const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};

describe('setting the pilot', () => {
  it('the R&D director sets it, audited; another profile may not; the input is checked', async () => {
    as('coordinator');
    expect(await setPilotAction(null, form({ startOn: '2026-10-12', facilities: ['PDE'] }))).toEqual({ ok: false, error: 'Only the R&D director sets the pilot' });
    as('rd_director');
    expect(await setPilotAction(null, form({ startOn: '2026-10-12', facilities: ['NOWHERE'] }))).toEqual({ ok: false, error: 'Choose active facilities' });
    expect(await setPilotAction(null, form({ startOn: '2026-10-12', weeks: '4', baselineWeeks: '13', facilities: ['PDE', 'LAB67'] }))).toEqual({ ok: true });
    expect(await readPilot()).toEqual({ startOn: '2026-10-12', weeks: 4, baselineWeeks: 13, facilities: ['LAB67', 'PDE'] });
    const [a] = await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'Pilot')).orderBy(desc(auditEntries.id)).limit(1);
    expect(a).toMatchObject({ area: 'Pilot', change: 'pilot set: 2026-10-12 · 4 weeks · LAB67, PDE', actorRole: 'rd_director' });
  });
});

describe('the start and the reference measure', () => {
  it('the checklist names what is missing: technicians of laboratoire 67, the history, the Entra sign-in (demo mode)', async () => {
    const items = await pilotReadiness((await readPilot())!);
    expect(items.filter((i) => !i.ok).map((i) => [i.key, i.missing])).toEqual([['technicians', ['LAB67']], ['history', []], ['auth', []]]);
    expect(items.find((i) => i.key === 'rules')).toMatchObject({ ok: true, count: 1 });
  });

  it('reference (13 weeks before) against the pilot so far, per facility; the partner sees laboratoire 67 only', async () => {
    as('rd_director');
    const s = (await readPilot())!;
    const c = await pilotComparison(await getViewer(), s, '2026-10-22');
    expect(c.facilities.map((f) => f.code)).toEqual(['LAB67', 'PDE']);
    expect([c.baseline.all.from, c.baseline.all.to, c.pilot?.all.from, c.pilot?.all.to]).toEqual(['2026-07-13', '2026-10-12', '2026-10-12', '2026-10-23']);
    const pde = { before: rates(c.baseline.byFacility.get('PDE')!), after: rates(c.pilot!.byFacility.get('PDE')!) };
    expect(pde.after.realisedWithPrep!).toBeGreaterThan(pde.before.realisedWithPrep!);
    // One zone of the PDE at a time: the other zones are blocked while one works.
    expect(pde.after.blocked!).toBeGreaterThan(0);
    as('partner');
    const p = await pilotComparison(await getViewer(), s, '2026-10-22');
    expect(p.facilities.map((f) => f.code)).toEqual(['LAB67']);
    expect([...p.pilot!.byFacility.keys()]).toEqual(['LAB67']);
  });

  it('before the start there is no pilot period yet', async () => {
    as('rd_director');
    const c = await pilotComparison(await getViewer(), { startOn: '2026-11-02', weeks: 4, baselineWeeks: 13, facilities: ['PDE'] }, '2026-10-22');
    expect(c.pilot).toBeNull();
    expect([...c.baseline.byFacility.keys()]).toEqual(['PDE']);
  });
});
