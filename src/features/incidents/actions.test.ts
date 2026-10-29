// Server Functions of delivery 5 on a fresh PostgreSQL database with the demo data set, demo mode ("View as"). Done-when of the
// delivery: a breakdown of the PDE produces a recovery scenario and the notifications, end to end — the technician declares the
// pilot out of service, the scenario moves the confirmed test of Orion to the first free day, the coordinator accepts it, the
// requester is told in the bell and by e-mail. Also: what-if simulations never move anything, urgencies, rights, the jobs of
// reminders and recap, the weekly snapshots and their view. The business clock follows the (fake) system time, Thu 22 Oct 2026.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { and, eq, sql } from 'drizzle-orm';
import { REAL_CLOCK } from '@/domain/clock';
import { parisInstant } from '@/lib/dates';
import { setClockForTests } from '@/server/clock';
import { auditEntries, bookings, conflicts, facilities, incidents, notifications, resources, scenarios, testNeeds, unavailabilities, users, weeklySnapshots } from '@/server/db/schema';
import { remindOverdueArbitrations, weeklyRecap } from '@/server/notify/jobs';
import { sendPendingMail } from '@/server/notify/mail';
import { computeWeeklySnapshots } from '@/server/planning/snapshots';
import { testDatabase, type TestDatabase } from '@/test/db';
import { setAcquisitionAction } from '@/features/resources/actions';
import { closeIncidentAction, decideScenarioAction, declareIncidentAction, declareUrgencyAction, markNotificationsReadAction, simulateAction } from './actions';

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
  vi.setSystemTime(parisInstant('2026-10-22', `11:${String(minute++).padStart(2, '0')}`));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const resourceId = async (code: string) => (await t.db.select({ id: resources.id }).from(resources).where(eq(resources.code, code)))[0].id;
const booking = async (ref: string) => (await t.db.select().from(bookings).where(eq(bookings.ref, ref)))[0];
const userId = async (name: string) => (await t.db.select({ id: users.id }).from(users).where(eq(users.displayName, name)))[0].id;
const bell = async (name: string) => (await t.db.select().from(notifications).where(eq(notifications.userId, await userId(name)))).map((n) => n.title).sort();
const scenario = async (ref: string) => (await t.db.select().from(scenarios).where(eq(scenarios.ref, ref)))[0];

describe('a breakdown of the PDE (delivery 5 done-when)', () => {
  it('the technician declares the pilot out of service 26–28 Oct: the unavailability, the incident and the recovery scenario', async () => {
    as('technician');
    const r = await declareIncidentAction(null, form({ kind: 'breakdown', resourceId: await resourceId('PDE-PIL'), fromOn: '2026-10-26', toOn: '2026-10-28', label: 'Firing chamber door seal' }));
    expect(r).toEqual({ ok: true, warnings: ['Incident AL-2026-0001', 'Scenario S-2026-0001'] });
    const [inc] = await t.db.select().from(incidents);
    expect(inc).toMatchObject({ ref: 'AL-2026-0001', kind: 'breakdown', status: 'open', declaredByName: 'Julien Masson' });
    const [u] = await t.db.select().from(unavailabilities).where(eq(unavailabilities.id, inc.unavailabilityId!));
    expect(u).toMatchObject({ kind: 'breakdown', source: 'incident', startsAt: parisInstant('2026-10-26', '00:00'), endsAt: parisInstant('2026-10-29', '00:00') });
    const s = await scenario('S-2026-0001');
    expect(s).toMatchObject({ kind: 'recovery', status: 'submitted', incidentId: inc.id });
    // Only the confirmed test of the pilot moves (the requested booking of the analysis room is not touched), to the 29th, on time.
    expect(s.moves).toEqual([expect.objectContaining({ ref: 'B-2026-0011', reason: null, to: expect.objectContaining({ resourceId: await resourceId('PDE-PIL'), start: parisInstant('2026-10-29', '07:00').getTime() }) })]);
    expect(s.impacts).toEqual([expect.objectContaining({ ref: 'B-2026-0011', projectCode: 'RD-ORION', beforeOn: '2026-10-27', afterOn: '2026-10-29' })]);
    // Nothing moved yet.
    expect((await booking('B-2026-0011')).startsAt).toEqual(parisInstant('2026-10-27', '07:00'));
  });

  it('the deciders and the requester are notified at once; the declarer is not', async () => {
    expect(await bell('Antoine Leroy')).toEqual(['Scenario to decide · S-2026-0001 · AL-2026-0001']);
    expect(await bell('Hélène Marchal')).toEqual(['Scenario to decide · S-2026-0001 · AL-2026-0001']);
    expect(await bell('Camille Fabre')).toEqual(['Incident on your test · AL-2026-0001']);
    expect(await bell('Julien Masson')).toEqual([]);
  });

  it('a project lead may not decide; the coordinator of the PDE accepts: the booking moves with its people, the requester is told', async () => {
    const s = await scenario('S-2026-0001');
    as('project_lead');
    expect(await decideScenarioAction(null, form({ scenarioId: s.id, decision: 'accept', reason: 'Looks fine' }))).toEqual({ ok: false, error: 'The R&D director or the coordinator of the facilities touched decides' });
    as('coordinator');
    expect(await decideScenarioAction(null, form({ scenarioId: s.id, decision: 'accept', reason: 'Day after the repair' }))).toEqual({ ok: true, warnings: ['1 bookings moved'] });
    const b = await booking('B-2026-0011');
    expect(b).toMatchObject({ status: 'confirmed', startsAt: parisInstant('2026-10-29', '07:00'), endsAt: parisInstant('2026-10-29', '17:00') });
    expect(await scenario('S-2026-0001')).toMatchObject({ status: 'accepted', decidedByName: 'Antoine Leroy', decisionReason: 'Day after the repair' });
    expect(await bell('Camille Fabre')).toEqual(['Incident on your test · AL-2026-0001', 'Your test was moved · B-2026-0011 · S-2026-0001']);
    const audit = await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'Scenario S-2026-0001'));
    expect(audit.map((a) => a.change)).toContain('status: submitted → accepted');
    // Decided once.
    expect(await decideScenarioAction(null, form({ scenarioId: s.id, decision: 'reject', reason: 'again' }))).toEqual({ ok: false, error: 'This scenario is not awaiting a decision' });
  });

  it('the worker e-mails every notification once, in French, with its link', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crucible-mail-'));
    try {
      const sent = await sendPendingMail(t.db, { transport: 'file', dir, from: 'crucible@epc2i.example', baseUrl: 'https://crucible.example' });
      expect(sent).toBe(4);
      // The text part is quoted-printable (nodemailer, CR-072): decoded before reading it.
      const qp = (x: string) => Buffer.from(x.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
      const files = fs.readdirSync(dir).map((f) => qp(fs.readFileSync(path.join(dir, f), 'latin1')));
      const moved = files.find((f) => f.includes('Votre essai a été déplacé · B-2026-0011 · S-2026-0001'))!;
      expect(moved).toMatch(/^From: Crucible <crucible@epc2i\.example>\r\nTo: \S+@/);
      expect(moved).toContain('Bonjour Camille Fabre,');
      expect(moved).toContain('https://crucible.example/projects/RD-ORION');
      expect(files.some((f) => f.includes('Scénario à trancher · S-2026-0001 · AL-2026-0001'))).toBe(true);
      expect(await sendPendingMail(t.db, { transport: 'file', dir, from: 'crucible@epc2i.example' })).toBe(0);
      expect(await sendPendingMail(t.db, { transport: 'none', dir: null, from: 'x' })).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the requester marks the bell read; the incident is closed by its declarer: the unavailability ends no later than now', async () => {
    as('project_lead');
    expect(await markNotificationsReadAction()).toEqual({ ok: true });
    expect((await t.db.select().from(notifications).where(and(eq(notifications.userId, await userId('Camille Fabre')), sql`${notifications.readAt} is null`))).length).toBe(0);
    const [inc] = await t.db.select().from(incidents);
    expect(await closeIncidentAction(inc.id)).toMatchObject({ ok: false });
    as('technician');
    expect(await closeIncidentAction(inc.id)).toEqual({ ok: true });
    const [u] = await t.db.select().from(unavailabilities).where(eq(unavailabilities.id, inc.unavailabilityId!));
    // Closed before it started: the unavailability shrinks to nothing.
    expect(u.endsAt).toEqual(u.startsAt);
  });
});

describe('what-if, urgencies, rights', () => {
  it('a what-if simulation computes the consequences and never moves nor notifies anything', async () => {
    const before = (await t.db.select().from(notifications)).length;
    as('technician');
    expect(await simulateAction(null, form({ resourceId: await resourceId('PDE-PIL'), fromOn: '2026-10-29', toOn: '2026-10-29' }))).toMatchObject({ ok: false });
    as('project_lead');
    const r = await simulateAction(null, form({ resourceId: await resourceId('PDE-PIL'), fromOn: '2026-10-29', toOn: '2026-10-30' }));
    expect(r).toEqual({ ok: true, warnings: ['Scenario S-2026-0002'] });
    const s = await scenario('S-2026-0002');
    expect(s).toMatchObject({ kind: 'what_if', status: 'simulation', incidentId: null, hypothesis: { resource: 'PDE-PIL', fromOn: '2026-10-29', toOn: '2026-10-30' } });
    expect(s.moves).toEqual([expect.objectContaining({ ref: 'B-2026-0011' })]);
    expect((await booking('B-2026-0011')).startsAt).toEqual(parisInstant('2026-10-29', '07:00'));
    expect((await t.db.select().from(notifications)).length).toBe(before);
    expect(await t.db.select().from(unavailabilities).where(eq(unavailabilities.label, 'What if'))).toEqual([]);
    as('coordinator');
    expect(await decideScenarioAction(null, form({ scenarioId: s.id, decision: 'accept', reason: 'try' }))).toEqual({ ok: false, error: 'This scenario is not awaiting a decision' });
  });

  it('an urgency: only the R&D director or the coordinator, with a reason; the urgent test is placed and booked once accepted', async () => {
    const [need] = await t.db.select().from(testNeeds).where(eq(testNeeds.status, 'open')).limit(1);
    as('project_lead');
    expect(await declareUrgencyAction(null, form({ needId: need.id, reason: 'Customer claim' }))).toEqual({ ok: false, error: 'Only the R&D director or the coordinator declares an urgency' });
    as('rd_director');
    expect(await declareUrgencyAction(null, form({ needId: need.id, reason: 'no' }))).toEqual({ ok: false, error: 'Give the reason of the urgency' });
    const r = await declareUrgencyAction(null, form({ needId: need.id, reason: 'Customer claim on the series' }));
    expect(r).toEqual({ ok: true, warnings: ['Incident AL-2026-0002', 'Scenario S-2026-0003'] });
    const s = await scenario('S-2026-0003');
    expect(s).toMatchObject({ kind: 'urgency', status: 'submitted' });
    const slot = (s.hypothesis as { urgentSlot: { resourceId: string; start: number } }).urgentSlot;
    expect(slot).toBeTruthy();
    const accepted = await decideScenarioAction(null, form({ scenarioId: s.id, decision: 'accept', reason: 'Approved by the direction' }));
    expect(accepted).toMatchObject({ ok: true });
    const urgent = await t.db.select().from(bookings).where(and(eq(bookings.needId, need.id), eq(bookings.startsAt, new Date(slot.start))));
    expect(urgent).toEqual([expect.objectContaining({ status: 'confirmed', resourceId: slot.resourceId })]);
    expect((accepted as { warnings: string[] }).warnings).toContain(`Booking confirmed · ${urgent[0].ref}`);
    // A displaced booking is placed again after the urgent test, never earlier than it was.
    expect((await booking('B-2026-0011')).startsAt.getTime()).toBeGreaterThanOrEqual(Math.max(slot.start, parisInstant('2026-10-29', '07:00').getTime()));
  });

  it('an absence: the declarer\'s own, or a person of the declarer\'s facilities; a partner may not declare a PDE person', async () => {
    const [{ id: personId }] = (await t.db.execute(sql`select id from crucible.people where 'PDE' = any(facility_codes) and active order by name limit 1`)).rows as { id: string }[];
    as('partner');
    expect(await declareIncidentAction(null, form({ kind: 'absence', personId, fromOn: '2026-11-02', toOn: '2026-11-03', label: 'Sick leave' }))).toEqual({ ok: false, error: 'You may declare your own absence, or one of a person of your facilities' });
    as('facility_manager');
    expect(await declareIncidentAction(null, form({ kind: 'absence', personId, fromOn: '2026-10-01', toOn: '2026-10-02', label: 'Sick leave' }))).toEqual({ ok: false, error: 'The incident is over: nothing to replan' });
    as('viewer');
    expect(await declareIncidentAction(null, form({ kind: 'absence', personId, fromOn: '2026-11-02', toOn: '2026-11-03', label: 'Sick leave' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
  });
});

describe('jobs and steering', () => {
  it('the acquisition cost of a facility (P-8): the R&D director only, a whole number of k€, audited', async () => {
    as('facility_manager');
    expect(await setAcquisitionAction(null, form({ facilityCode: 'PDE', acquisitionKeur: '3100' }))).toMatchObject({ ok: false });
    as('rd_director');
    expect(await setAcquisitionAction(null, form({ facilityCode: 'PDE', acquisitionKeur: '-4' }))).toEqual({ ok: false, error: 'Enter the acquisition cost in k€ (a whole number)' });
    expect(await setAcquisitionAction(null, form({ facilityCode: 'PDE', acquisitionKeur: '3100' }))).toEqual({ ok: true });
    expect((await t.db.select().from(facilities).where(eq(facilities.code, 'PDE')))[0].acquisitionKeur).toBe(3100);
    expect((await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'Facility PDE'))).map((a) => a.change)).toContain('acquisition cost: 3000 → 3100 k€');
  });


  it('an arbitration past its due date is reminded once a day to its decider, then to the R&D director two working days later', async () => {
    const [c] = await t.db.select().from(conflicts).where(eq(conflicts.ref, 'C-2026-0001'));
    expect(await remindOverdueArbitrations(t.db, '2026-10-27', parisInstant('2026-10-27', '08:00'))).toBe(1);
    expect(await remindOverdueArbitrations(t.db, '2026-10-27', parisInstant('2026-10-27', '08:00'))).toBe(0);
    expect(await bell('Antoine Leroy')).toContain(`Arbitration overdue · C-2026-0001 · ${c.dueOn}`);
    expect(await remindOverdueArbitrations(t.db, '2026-10-28', parisInstant('2026-10-28', '08:00'))).toBe(2);
  });

  it('the weekly recap lists the confirmed tests of the next two weeks', async () => {
    expect(await weeklyRecap(t.db, '2026-10-26', parisInstant('2026-10-26', '07:00'))).toBeGreaterThan(0);
    expect((await bell('Camille Fabre')).some((x) => x.startsWith('Your tests of the next two weeks · ') && x.includes('B-2026-0011'))).toBe(true);
  });

  it('weekly snapshots: computed once per completed week, kept, published by pub_occupation_hebdo', async () => {
    const before = (await t.db.select().from(weeklySnapshots)).length;
    expect(before).toBeGreaterThan(0);
    expect(await computeWeeklySnapshots(t.db, '2026-10-22', 6)).toBe(0);
    const added = await computeWeeklySnapshots(t.db, '2026-10-29', 6);
    expect(added).toBe((await t.db.select().from(resources)).filter((r) => r.status !== 'retired').length);
    const client = new pg.Client({ connectionString: t.url });
    await client.connect();
    try {
      const cols = await client.query(`select column_name from information_schema.columns where table_schema = 'crucible' and table_name = 'pub_occupation_hebdo' order by ordinal_position`);
      expect(cols.rows.map((r) => r.column_name)).toEqual([
        'semaine', 'moyen_code', 'installation_code', 'heures_ouvertes_nettes', 'heures_reservees', 'heures_realisees', 'heures_realisees_preparation', 'heures_bloquees',
        'reservations_non_tenues', 'taux_realise_pct', 'maj_le',
      ]);
      const rows = await client.query(`select * from crucible.pub_occupation_hebdo where semaine = '2026-10-19' and moyen_code = 'PDE-PIL'`);
      expect(rows.rows).toHaveLength(1);
      expect(Number(rows.rows[0].heures_ouvertes_nettes)).toBeGreaterThan(0);
    } finally {
      await client.end();
    }
  });
});
