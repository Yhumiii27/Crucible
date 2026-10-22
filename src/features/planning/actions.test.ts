// Server Functions of delivery 4 on a fresh PostgreSQL database with the demo data set (its first engine run included), demo
// mode ("View as"): the conflict of the PDE and its recommendation, who runs the engine, decides, vetoes and accepts, the
// arbitrated order applied by the next run, proposals that no longer fit refused, substitutions validated, priority rules
// published, people kept by the managers of their facilities, titles read from Cursus. The business clock follows the (fake)
// system time, Thu 22 Oct 2026 at 10:00.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import pg from 'pg';
import { and, desc, eq } from 'drizzle-orm';
import { REAL_CLOCK } from '@/domain/clock';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import {
  arbitrations, bookingEquipment, bookingStaff, bookings, conflicts, people, personAbsences, personSkills, planRuns, priorityRuleSets, proposals, resources, substitutions,
  testNeeds, testTypeSkills,
} from '@/server/db/schema';
import { testDatabase, type TestDatabase } from '@/test/db';
import {
  acceptProposalsAction, addAbsenceAction, createPersonAction, decideConflictAction, publishPriorityRulesAction, runEngineAction, setPersonSkillAction,
  setTestTypeRequirementsAction, syncCursusSkillsAction, validateSubstitutionAction, vetoConflictAction,
} from './actions';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase();
  setClockForTests(REAL_CLOCK);
});
afterAll(async () => {
  setClockForTests(null);
  await t.close();
});
let minute = 0;
beforeEach(() => {
  jar.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(parisInstant('2026-10-22', `10:${String(minute++).padStart(2, '0')}`));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
const needId = async (ref: string) => (await t.db.select({ id: testNeeds.id }).from(testNeeds).where(eq(testNeeds.ref, ref)))[0].id;
const latestRun = async () => (await t.db.select().from(planRuns).orderBy(desc(planRuns.runAt)).limit(1))[0];
const openProposal = async (ref: string) => (await t.db.select({ p: proposals, code: resources.code }).from(proposals).innerJoin(resources, eq(resources.id, proposals.resourceId))
  .where(and(eq(proposals.needId, await needId(ref)), eq(proposals.status, 'proposed'))))[0];
const theConflict = async () => (await t.db.select().from(conflicts).where(eq(conflicts.ref, 'C-2026-0001')))[0];

describe('the demo run (delivery 4 done-when)', () => {
  it('writes the PDE conflict: Cassiopée first (rule rank 1), Vega one working day late, Vega first with Cassiopée on its substitute recommended', async () => {
    const c = await theConflict();
    expect(c).toMatchObject({ subject: 'PDE-ONE-ZONE', ruleCited: 'safety_regulatory', ruleRank: 1, ruleVersion: 1, decider: 'coordinator', status: 'open', recommendedKey: 'N-2026-0002>N-2026-0003', dueOn: '2026-10-26' });
    expect((await openProposal('N-2026-0002')).p.lateDays).toBe(1);
    const run = await latestRun();
    expect(run.summary.unplaced).toEqual([expect.objectContaining({ needRef: 'N-2026-0001', reason: 'inspection_due' })]);
  });
});

describe('engine and conflicts', () => {
  it('a project lead may not run the engine; the R&D director runs it again: same conflict, not duplicated', async () => {
    as('project_lead');
    expect(await runEngineAction()).toMatchObject({ ok: false });
    as('rd_director');
    expect(await runEngineAction()).toEqual({ ok: true, warnings: ['Run R-2026-0002', '4 proposals', '1 conflicts'] });
    expect(await t.db.select().from(conflicts)).toHaveLength(1);
    expect((await t.db.select().from(proposals).where(eq(proposals.status, 'superseded'))).length).toBe(4);
  });

  it('the coordinator decides the recommended option; the next run serves Vega first and puts Cassiopée on the analysis room', async () => {
    const c = await theConflict();
    as('technician');
    expect(await decideConflictAction(null, form({ conflictId: c.id, optionKey: c.recommendedKey, reason: 'No delay for anyone' }))).toMatchObject({ ok: false });
    as('coordinator');
    expect(await decideConflictAction(null, form({ conflictId: c.id, optionKey: 'nope', reason: 'No delay for anyone' }))).toEqual({ ok: false, error: 'Choose one of the options' });
    expect(await decideConflictAction(null, form({ conflictId: c.id, optionKey: c.recommendedKey, reason: 'No delay for anyone' }))).toEqual({ ok: true });
    const [a] = await t.db.select().from(arbitrations).where(eq(arbitrations.conflictId, c.id));
    expect(a).toMatchObject({ kind: 'decision', ruleInvoked: 'recommended · safety_regulatory', decidedByName: 'Antoine Leroy', order: [await needId('N-2026-0002'), await needId('N-2026-0003')] });
    await expect(t.db.update(arbitrations).set({ reason: 'changed' }).where(eq(arbitrations.id, a.id))).rejects.toThrow();
    vi.setSystemTime(parisInstant('2026-10-22', '11:30'));
    expect((await runEngineAction()).ok).toBe(true);
    expect(await openProposal('N-2026-0002')).toMatchObject({ code: 'PDE-ATM', p: { lateDays: 0 } });
    expect(await openProposal('N-2026-0003')).toMatchObject({ code: 'LAB67-ANA', p: { substitute: true, lateDays: 0 } });
    expect((await t.db.select().from(conflicts)).map((x) => x.status)).toEqual(['decided']);
  });

  it('accepting: the PDE manager confirms the PDE proposal, not the laboratoire 67 one; the booking carries its need, people and equipment', async () => {
    const vega = await openProposal('N-2026-0002');
    const cass = await openProposal('N-2026-0003');
    as('facility_manager');
    const r = await acceptProposalsAction(null, form({ proposalIds: [vega.p.id, cass.p.id] }));
    expect(r).toEqual({ ok: true, warnings: ['1 bookings confirmed', 'N-2026-0003 · Not a proposal of the latest run you may accept'] });
    const [b] = await t.db.select().from(bookings).where(eq(bookings.needId, await needId('N-2026-0002')));
    expect(b).toMatchObject({ status: 'confirmed', resourceId: vega.p.resourceId, confirmedByName: 'Damien Petit', projectCode: 'RD-VEGA' });
    expect((await t.db.select().from(bookingStaff).where(eq(bookingStaff.bookingId, b.id))).map((x) => x.skillCode)).toEqual(['MECA']);
    expect((await t.db.select().from(proposals).where(eq(proposals.id, vega.p.id)))[0]).toMatchObject({ status: 'accepted', bookingId: b.id });
  });

  it('a proposal whose person became absent is refused with the reason; the others are not blocked', async () => {
    const cass = await openProposal('N-2026-0003');
    const [person] = await t.db.select().from(people).where(eq(people.id, cass.p.staff[0].personId));
    await t.db.insert(personAbsences).values({ personId: person.id, fromOn: '2026-12-14', toOn: '2026-12-18', createdByName: 'Test' });
    as('coordinator');
    const r = await acceptProposalsAction(null, form({ proposalIds: [cass.p.id] }));
    expect(r).toEqual({ ok: false, error: `N-2026-0003 · Absent · ${person.name}` });
    await t.db.delete(personAbsences).where(eq(personAbsences.personId, person.id));
  });

  it('the safety officer vetoes the decision: the next run no longer applies it and the sheet is to arbitrate again', async () => {
    const c = await theConflict();
    as('coordinator');
    expect(await vetoConflictAction(null, form({ conflictId: c.id, reason: 'Hazardous trials in the analysis room' }))).toMatchObject({ ok: false });
    as('safety');
    expect(await vetoConflictAction(null, form({ conflictId: c.id, reason: 'Hazardous trials in the analysis room this month' }))).toEqual({ ok: true });
    expect((await theConflict()).status).toBe('vetoed');
    expect((await t.db.select().from(arbitrations).where(eq(arbitrations.conflictId, c.id))).map((x) => x.kind)).toEqual(['decision', 'veto']);
  });
});

describe('rules, substitutions, people', () => {
  it('priority rules: only the R&D director publishes a complete order; versions are kept', async () => {
    const order = ['priority_class', 'safety_regulatory', 'contractual', 'critical_milestone', 'slack', 'seniority'];
    const fd = (xs: string[]) => form(Object.fromEntries(xs.map((c, i) => [`criterion${i + 1}`, c])));
    as('coordinator');
    expect(await publishPriorityRulesAction(null, fd(order))).toMatchObject({ ok: false });
    as('rd_director');
    expect(await publishPriorityRulesAction(null, fd([...order.slice(0, 5), 'slack']))).toEqual({ ok: false, error: 'Give each criterion one rank' });
    expect(await publishPriorityRulesAction(null, fd(order))).toEqual({ ok: true });
    expect((await t.db.select().from(priorityRuleSets).orderBy(desc(priorityRuleSets.version)))[0]).toMatchObject({ version: 2, criteria: order, publishedByName: 'Hélène Marchal' });
  });

  it('a substitution not hazardous is validated by the host facility’s manager alone (R-4)', async () => {
    const [s] = await t.db.select().from(substitutions).where(eq(substitutions.testTypeCode, 'TENSILE'));
    as('partner');
    expect(await validateSubstitutionAction(s.id)).toMatchObject({ ok: false });
    as('facility_manager');
    expect(await validateSubstitutionAction(s.id)).toEqual({ ok: true });
    expect((await t.db.select().from(substitutions).where(eq(substitutions.id, s.id)))[0]).toMatchObject({ status: 'validated', hostValidatedByName: 'Damien Petit', safetyValidatedByName: null });
  });

  it('people are kept by the managers of their facilities; requirements by the coordinator', async () => {
    as('facility_manager');
    expect(await createPersonAction(null, form({ name: 'Nina Roche', entityCode: 'EPC2I', facilityCodes: ['LAB67'] }))).toEqual({ ok: false, error: 'Choose the facilities where the person works' });
    expect(await createPersonAction(null, form({ name: 'Nina Roche', entityCode: 'EPC2I', matricule: 'EP0700', facilityCodes: ['PDE'] }))).toEqual({ ok: true });
    const [nina] = await t.db.select().from(people).where(eq(people.name, 'Nina Roche'));
    expect(await setPersonSkillAction(null, form({ personId: nina.id, skillCode: 'MECA', validUntil: '2027-12-31' }))).toEqual({ ok: true });
    expect(await addAbsenceAction(null, form({ personId: nina.id, fromOn: '2026-11-02', toOn: '2026-11-06' }))).toEqual({ ok: true });
    as('partner');
    expect(await setPersonSkillAction(null, form({ personId: nina.id, skillCode: 'PYRO' }))).toMatchObject({ ok: false });
    as('coordinator');
    expect(await setTestTypeRequirementsAction(null, form({ testTypeCode: 'MACHINING', skillCodes: ['MECA'], 'count-MECA': '2' }))).toEqual({ ok: true });
    expect(await t.db.select().from(testTypeSkills).where(eq(testTypeSkills.testTypeCode, 'MACHINING'))).toEqual([{ testTypeCode: 'MACHINING', skillCode: 'MECA', count: 2 }]);
  });

  it('titles are read from Cursus once its view is granted (S-3)', async () => {
    as('coordinator');
    expect(await syncCursusSkillsAction()).toEqual({ ok: false, error: 'The Cursus view of the titles held is not published or not granted to Crucible yet' });
    const admin = new pg.Client({ connectionString: t.url });
    await admin.connect();
    await admin.query(`create schema cursus;
      create view cursus.pub_titres_detenus as select * from (values ('EP0388', 'habilitation.PYRO', date '2028-01-31'), ('EP0999', 'habilitation.PYRO', date '2028-01-31')) v(matricule, titre_id, utilisable_jusqu_au);
      grant usage on schema cursus to ${t.role}; grant select on cursus.pub_titres_detenus to ${t.role};`);
    await admin.end();
    expect(await syncCursusSkillsAction()).toEqual({ ok: true, warnings: ['1 titles read from Cursus'] });
    const [karim] = await t.db.select().from(people).where(eq(people.matricule, 'EP0388'));
    expect((await t.db.select().from(personSkills).where(and(eq(personSkills.personId, karim.id), eq(personSkills.skillCode, 'PYRO'))))[0]).toMatchObject({ validUntil: '2028-01-31', source: 'cursus' });
  });
});

describe('every proposal of the demo passes the acceptance checks', () => {
  it('the coordinator accepts every open proposal of a new run: none is refused', async () => {
    as('rd_director');
    vi.setSystemTime(parisInstant('2026-10-22', '15:00'));
    expect((await runEngineAction()).ok).toBe(true);
    const open = await t.db.select().from(proposals).where(eq(proposals.status, 'proposed'));
    expect(open.length).toBeGreaterThan(0);
    as('coordinator');
    const r = await acceptProposalsAction(null, form({ proposalIds: open.map((p) => p.id) }));
    expect(r).toEqual({ ok: true, warnings: [`${open.length} bookings confirmed`] });
    const eq_ = await t.db.select().from(bookingEquipment);
    expect(eq_.length).toBeGreaterThanOrEqual(2);
  });
});
