// Server Functions of delivery 2 on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): who may act,
// the hard constraints refused with their reason (P-2: one zone of the PDE at a time), what is written and audited.
// The business clock follows the (fake) system time, set per test from the demo date, Thu 22 Oct 2026 at 10:00.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { and, desc, eq } from 'drizzle-orm';
import { REAL_CLOCK } from '@/domain/clock';
import { setClockForTests } from '@/server/clock';
import { parisInstant } from '@/lib/dates';
import { auditEntries, bookings, entityAgreements, exclusionRules, inspections, resources, unavailabilities } from '@/server/db/schema';
import { testDatabase, type TestDatabase } from '@/test/db';
import {
  addUnavailabilityAction, cancelBookingAction, confirmBookingAction, createResourceAction, finishBookingAction, importHistoryAction, markNoShowAction,
  proposeRuleAction, recordInspectionAction, requestBookingAction, retireRuleAction, setAgreementAction, startBookingAction, validateRuleAction,
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
beforeEach(() => {
  jar.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(parisInstant('2026-10-22', '10:00'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
const rid = async (code: string) => (await t.db.select({ id: resources.id }).from(resources).where(eq(resources.code, code)))[0].id;
const booking = async (ref: string) => (await t.db.select().from(bookings).where(eq(bookings.ref, ref)))[0];
const lastAudit = async (objectRef: string) => (await t.db.select().from(auditEntries).where(and(eq(auditEntries.objectRef, objectRef))).orderBy(desc(auditEntries.occurredAt)).limit(1))[0];
const halfDays = (resourceId: string, projectCode: string, day: string, fromHalf: string, toHalf: string, title = 'Test run') =>
  form({ resourceId, projectCode, fromOn: day, toOn: day, fromHalf, toHalf, title });

describe('booking requests', () => {
  it('a project lead books a free half-day of the pilot for their project; the request is audited', async () => {
    as('project_lead');
    const r = await requestBookingAction(null, halfDays(await rid('PDE-PIL'), 'RD-ORION', '2026-11-02', 'am', 'am', 'Firing tests, series 3'));
    expect(r).toEqual({ ok: true, warnings: [] });
    const [b] = await t.db.select().from(bookings).where(eq(bookings.title, 'Firing tests, series 3'));
    expect(b).toMatchObject({ status: 'requested', projectCode: 'RD-ORION', entityCode: 'EPC2I', requestedByName: 'Camille Fabre', setupMinutes: 90, teardownMinutes: 60 });
    expect(b.startsAt).toEqual(parisInstant('2026-11-02', '07:00'));
    expect(b.ref).toBe('B-2026-0017');
    expect(await lastAudit('Booking B-2026-0017')).toMatchObject({ change: 'requested: PDE-PIL', projectCode: 'RD-ORION', area: 'Bookings' });
  });

  it('P-2: the laboratory rooms are refused while the pilot is confirmed, citing the rule and the zone that holds the PDE', async () => {
    as('project_lead');
    const r = await requestBookingAction(null, halfDays(await rid('PDE-LAB'), 'RD-CASSIOPEE', '2026-10-27', 'pm', 'pm'));
    expect(r).toEqual({ ok: false, error: 'Exclusion rule · PDE-ONE-ZONE · PDE-PIL' });
  });

  it('refuses a slot past an inspection due date (R-6), outside half-days, and a project or a resource outside the requester’s reach', async () => {
    as('project_lead');
    expect(await requestBookingAction(null, halfDays(await rid('PDE-PIL'), 'RD-ORION', '2026-11-17', 'am', 'am')))
      .toEqual({ ok: false, error: 'A regulatory inspection falls due before the end of the slot · Periodic check of the electrical installations · 2026-11-16' });
    expect(await requestBookingAction(null, halfDays(await rid('PDE-PIL'), 'RD-ORION', '2026-11-11', 'am', 'am'))).toEqual({ ok: false, error: 'Outside the facility’s opening hours or half-days' });
    expect(await requestBookingAction(null, halfDays(await rid('PDE-PIL'), 'RD-VEGA', '2026-11-02', 'pm', 'pm'))).toEqual({ ok: false, error: 'You may not book this resource for this project' });
    as('partner');
    expect(await requestBookingAction(null, halfDays(await rid('PDE-PIL'), 'FR-LYRA', '2026-11-02', 'pm', 'pm'))).toEqual({ ok: false, error: 'Choose a resource and a project' });
    as('technician');
    expect((await requestBookingAction(null, halfDays(await rid('PDE-PIL'), 'RD-ORION', '2026-11-02', 'pm', 'pm'))).ok).toBe(false);
  });

  it('EPC France books the tensile bench of laboratoire 67 by the hour; short notice is a warning (A-3)', async () => {
    as('partner');
    const r = await requestBookingAction(null, form({ resourceId: await rid('LAB67-TRAC'), projectCode: 'FR-LYRA', fromOn: '2026-10-30', toOn: '2026-10-30', fromTime: '09:00', toTime: '10:30', title: 'Extra tensile tests' }));
    expect(r).toEqual({ ok: true, warnings: ['Late request: less notice than agreed'] });
  });
});

describe('confirmation, cancellation, real times', () => {
  it('the coordinator confirms a request; a request the PDE rule now forbids is refused at confirmation', async () => {
    as('coordinator');
    const forbidden = await booking('B-2026-0012');
    expect(await confirmBookingAction(forbidden.id)).toEqual({ ok: false, error: 'Exclusion rule · PDE-ONE-ZONE · PDE-PIL' });
    const free = await booking('B-2026-0013');
    expect(await confirmBookingAction(free.id)).toEqual({ ok: true, warnings: [] });
    expect(await booking('B-2026-0013')).toMatchObject({ status: 'confirmed', confirmedByName: 'Antoine Leroy' });
    as('project_lead');
    expect((await confirmBookingAction(forbidden.id)).ok).toBe(false);
  });

  it('the requester cancels with a reason; a stranger cannot', async () => {
    const b = await booking('B-2026-0012');
    as('partner');
    expect((await cancelBookingAction(null, form({ bookingId: b.id, reason: 'Not mine' }))).ok).toBe(false);
    as('project_lead');
    expect(await cancelBookingAction(null, form({ bookingId: b.id, reason: '' }))).toEqual({ ok: false, error: 'Give the reason' });
    expect(await cancelBookingAction(null, form({ bookingId: b.id, reason: 'Done with the pilot run instead' }))).toEqual({ ok: true });
    expect(await booking('B-2026-0012')).toMatchObject({ status: 'cancelled', cancelReason: 'Done with the pilot run instead' });
    expect(await lastAudit('Booking B-2026-0012')).toMatchObject({ change: 'status: requested → cancelled', reason: 'Done with the pilot run instead' });
  });

  it('the technician of the PDE starts and ends today’s test; the actual times are kept', async () => {
    const b = await booking('B-2026-0010');
    as('partner');
    expect((await startBookingAction(b.id)).ok).toBe(false);
    as('technician');
    vi.setSystemTime(parisInstant('2026-10-22', '12:20'));
    expect(await startBookingAction(b.id)).toEqual({ ok: true });
    vi.setSystemTime(parisInstant('2026-10-22', '16:40'));
    expect(await finishBookingAction(null, form({ bookingId: b.id }))).toEqual({ ok: true });
    const done = await booking('B-2026-0010');
    expect(done).toMatchObject({ status: 'done', actualStartAt: parisInstant('2026-10-22', '12:20'), actualEndAt: parisInstant('2026-10-22', '16:40') });
  });

  it('a confirmed booking not started two hours after its start is released by a manager (A-7)', async () => {
    const b = await booking('B-2026-0011');
    as('facility_manager');
    vi.setSystemTime(parisInstant('2026-10-27', '08:30'));
    expect((await markNoShowAction(b.id)).ok).toBe(false);
    vi.setSystemTime(parisInstant('2026-10-27', '09:05'));
    expect(await markNoShowAction(b.id)).toEqual({ ok: true });
    expect((await booking('B-2026-0011')).status).toBe('no_show');
  });
});

describe('resources, calendars, rules, agreements', () => {
  it('a facility manager adds a resource, an unavailability and an inspection to their facility only', async () => {
    as('facility_manager');
    expect(await createResourceAction(null, form({ code: 'pde-mag', facilityCode: 'PDE', name: 'Storage room', kind: 'room', granularity: 'half_day' }))).toEqual({ ok: true });
    expect(await createResourceAction(null, form({ code: 'LAB67-X', facilityCode: 'LAB67', name: 'Other', kind: 'room' }))).toEqual({ ok: false, error: 'Choose one of your facilities' });
    const atm = await rid('PDE-ATM');
    expect(await addUnavailabilityAction(null, form({ resourceId: atm, kind: 'breakdown', label: 'Lathe spindle broken', fromOn: '2026-11-09', toOn: '2026-11-10' }))).toEqual({ ok: true });
    expect(await t.db.$count(unavailabilities, eq(unavailabilities.resourceId, atm))).toBe(1);
    expect(await recordInspectionAction(null, form({ resourceId: await rid('PDE-PIL'), label: 'Periodic check of the electrical installations', periodMonths: '12', lastOn: '2026-10-20' }))).toEqual({ ok: true });
    expect((await t.db.select().from(inspections).where(eq(inspections.label, 'Periodic check of the electrical installations')))[0].lastOn).toBe('2026-10-20');
    expect(await lastAudit('Resource PDE-PIL')).toMatchObject({ change: 'inspection: Periodic check of the electrical installations · 2025-11-16 → 2026-10-20' });
    as('technician');
    expect((await addUnavailabilityAction(null, form({ resourceId: atm, kind: 'other', label: 'x y', fromOn: '2026-11-12' }))).ok).toBe(false);
  });

  it('an exclusion rule is proposed by a manager and applies only once the safety officer validates it (R-3)', async () => {
    as('coordinator');
    const [trac, ana] = [await rid('LAB67-TRAC'), await rid('LAB67-ANA')];
    expect(await proposeRuleAction(null, form({ code: 'LAB67-POWER', label: 'Shared power supply', maxActive: '1', reason: 'energy', motive: 'The two share one power line.', resourceIds: [trac, ana] }))).toEqual({ ok: true });
    const [rule] = await t.db.select().from(exclusionRules).where(eq(exclusionRules.code, 'LAB67-POWER'));
    expect(rule.status).toBe('proposed');
    // Awaiting validation, the rule only warns: the tensile bench is booked on 29 Oct 08:00–11:00 (B-2026-0015).
    const morning = () => halfDays(ana, 'RD-ORION', '2026-10-29', 'am', 'am', 'Residue analysis');
    expect(await requestBookingAction(null, morning())).toEqual({ ok: true, warnings: ['An exclusion rule awaiting validation concerns this slot · LAB67-POWER · LAB67-TRAC'] });
    expect(await validateRuleAction(rule.id)).toEqual({ ok: false, error: 'Only the safety officer validates an exclusion rule' });
    as('safety');
    vi.setSystemTime(parisInstant('2026-10-22', '10:01'));
    expect(await validateRuleAction(rule.id)).toEqual({ ok: true });
    expect((await t.db.select().from(exclusionRules).where(eq(exclusionRules.id, rule.id)))[0]).toMatchObject({ status: 'validated', validatedByName: 'Nathalie Brun' });
    as('coordinator');
    expect(await requestBookingAction(null, morning())).toEqual({ ok: false, error: 'Exclusion rule · LAB67-POWER · LAB67-TRAC' });
    as('safety');
    vi.setSystemTime(parisInstant('2026-10-22', '10:02'));
    expect(await retireRuleAction(null, form({ ruleId: rule.id, reason: 'Separate power lines installed' }))).toEqual({ ok: true });
    expect(await lastAudit('Rule LAB67-POWER')).toMatchObject({ change: 'status: validated → retired', reason: 'Separate power lines installed' });
  });

  it('the sharing agreement is the R&D director’s (A-3)', async () => {
    as('coordinator');
    expect((await setAgreementAction(null, form({ facilityCode: 'LAB67', entityCode: 'EPCFR', quotaDaysPerMonth: '6' }))).ok).toBe(false);
    as('rd_director');
    expect(await setAgreementAction(null, form({ facilityCode: 'LAB67', entityCode: 'EPCFR', quotaDaysPerMonth: '6', noticeWorkdays: '5' }))).toEqual({ ok: true });
    expect((await t.db.select().from(entityAgreements))[0]).toMatchObject({ quotaDaysPerMonth: 6, noticeWorkdays: 5, updatedByName: 'Hélène Marchal' });
    expect((await setAgreementAction(null, form({ facilityCode: 'PDE', entityCode: 'EPCFR' }))).ok).toBe(false);
  });

  it('the coordinator imports past bookings for the reference measure (F-9)', async () => {
    as('coordinator');
    const csv = 'PDE-PIL;RD-ORION;2026-09-01 07:00;2026-09-01 17:00;2026-09-01 07:30;2026-09-01 16:00;Firing tests (history)\nPDE-ATM;RD-VEGA;2026-09-02 07:00;2026-09-02 12:00;absent;;Machining (history)';
    expect(await importHistoryAction(null, form({ csv }))).toEqual({ ok: true, warnings: ['2 past bookings imported'] });
    const imported = await t.db.select().from(bookings).where(eq(bookings.source, 'import'));
    expect(imported.map((b) => [b.status, b.title]).sort()).toEqual([['done', 'Firing tests (history)'], ['no_show', 'Machining (history)']]);
    as('project_lead');
    expect((await importHistoryAction(null, form({ csv }))).ok).toBe(false);
  });
});
