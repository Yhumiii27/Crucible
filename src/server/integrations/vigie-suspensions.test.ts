// Test suspensions read from Vigie (V-2, M-21) on a fresh PostgreSQL database with the demo data set:
// - a facility manager says which Vigie zones a resource of their facility is in (only theirs; audited);
// - once vigie.pub_suspensions_essais is published and granted, each suspension of such a zone makes the resource unavailable
//   (works, whole days), the bookings it covers stay where they are and are flagged to the facility's managers;
// - the unavailability follows Vigie (changed, withdrawn) and cannot be removed in Crucible; a change of its text alone flags
//   nothing again.
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { and, eq, gt, inArray } from 'drizzle-orm';
import { removeUnavailabilityAction, setVigieZonesAction } from '@/features/resources/actions';
import { parisInstant } from '@/lib/dates';
import { auditEntries, bookings, notifications, resources, unavailabilities, vigieZoneResources } from '@/server/db/schema';
import { readVigieSuspensions, vigieZones } from '@/server/integrations/connectors';
import { testDatabase, type TestDatabase } from '@/test/db';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase();
});
afterAll(async () => t.close());
beforeEach(() => jar.clear());

const as = (role: string) => jar.set('crucible-role', role);
const by = { name: 'Test', userId: null, role: null };
const read = () => t.db.transaction((tx) => readVigieSuspensions(tx, by));
const admin = async (q: string) => {
  const c = new pg.Client({ connectionString: t.url });
  await c.connect();
  try {
    await c.query(q);
  } finally {
    await c.end();
  }
};
const COLUMNS = 'activite_id, site_code, zone_id, zone_nom, zone_type, du, au, plage_horaire, entreprise, motif, maj_le';
const publish = (values: string) =>
  admin(`create schema if not exists vigie;
    create or replace view vigie.pub_suspensions_essais as select * from (values ${values}) v(${COLUMNS});
    grant usage on schema vigie to ${t.role}; grant select on vigie.pub_suspensions_essais to ${t.role};`);
const row = (id: number, zone: number, du: string, au: string, motif = 'Câblage') =>
  `(${id}, 'smc', ${zone}, 'Banc pyro', 'essais', date '${du}', date '${au}', '08:00-12:00', 'Elec Est', '${motif}', now())`;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const fromVigie = () => t.db.select().from(unavailabilities).where(eq(unavailabilities.source, 'vigie'));

/** A booking still to come on a PDE resource (the demo data set has some). */
async function pdeBooking() {
  const [b] = await t.db.select({ id: bookings.id, ref: bookings.ref, resourceId: bookings.resourceId, startsAt: bookings.startsAt, status: bookings.status }).from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .where(and(eq(resources.facilityCode, 'PDE'), inArray(bookings.status, ['requested', 'confirmed']), gt(bookings.startsAt, parisInstant('2026-10-23', '00:00'))))
    .orderBy(bookings.startsAt).limit(1);
  return b;
}
const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);

describe('Vigie zones of the resources', () => {
  it('a facility manager sets the zones of a resource of their facility only; audited', async () => {
    const b = await pdeBooking();
    const [lab] = await t.db.select().from(resources).where(eq(resources.facilityCode, 'LAB67')).limit(1);
    as('facility_manager');
    expect(await setVigieZonesAction(null, form({ resourceId: b.resourceId, zones: '12, x' }))).toEqual({ ok: false, error: 'Enter the Vigie zone numbers, separated by commas' });
    expect(await setVigieZonesAction(null, form({ resourceId: lab.id, zones: '12' }))).toEqual({ ok: false, error: 'This action is not in your workspace' });
    expect(await setVigieZonesAction(null, form({ resourceId: b.resourceId, zones: '14 12' }))).toEqual({ ok: true, warnings: ['Taken into account at the next read of the connectors'] });
    expect((await t.db.select().from(vigieZoneResources)).map((z) => z.zoneId).sort()).toEqual([12, 14]);
    const [a] = await t.db.select().from(auditEntries).where(eq(auditEntries.change, 'Vigie zones: 12, 14'));
    expect(a).toBeDefined();
    as('technician');
    expect((await setVigieZonesAction(null, form({ resourceId: b.resourceId, zones: '' }))).ok).toBe(false);
  });
});

describe('vigie.pub_suspensions_essais (V-2, M-21)', () => {
  it('not published: a state, nothing read; the zones are not offered', async () => {
    expect(await read()).toMatchObject({ view: 'vigie.pub_suspensions_essais', readable: false, read: 0 });
    expect(await vigieZones(t.db)).toBeNull();
  });

  it('a suspension of a zone makes its resources unavailable; the bookings it covers are flagged, not moved', async () => {
    const b = await pdeBooking();
    const day = dayOf(b.startsAt);
    await publish([row(7, 12, day, day), row(8, 99, day, day), row(9, 12, '2026-10-01', '2026-10-02')].join(', '));
    expect(await vigieZones(t.db)).toEqual([{ id: 12, name: 'Banc pyro', kind: 'essais', siteCode: 'smc' }, { id: 99, name: 'Banc pyro', kind: 'essais', siteCode: 'smc' }]);
    expect(await read()).toMatchObject({ readable: true, read: 2, added: 1, changed: 0, removed: 0 });
    const [u] = await fromVigie();
    expect(u).toMatchObject({ resourceId: b.resourceId, kind: 'works', sourceRef: 'suspension:7', label: 'Vigie · Elec Est · Câblage · 08:00-12:00', startsAt: parisInstant(day, '00:00') });
    const after = (await t.db.select().from(bookings).where(eq(bookings.id, b.id)))[0];
    expect([after.status, after.startsAt]).toEqual([b.status, b.startsAt]);
    const n = await t.db.select().from(notifications).where(eq(notifications.kind, 'outside_works'));
    expect(n.length).toBeGreaterThan(0);
    expect(n[0]).toMatchObject({ bookingId: b.id, href: '/facilities/PDE?tab=calendar' });
    expect(n[0].title).toContain(b.ref);
    // A second read changes nothing and notifies no one again.
    expect(await read()).toMatchObject({ added: 0, changed: 0, removed: 0 });
    expect(await t.db.$count(notifications, eq(notifications.kind, 'outside_works'))).toBe(n.length);
  });

  it('cannot be removed in Crucible; follows Vigie when changed, then withdrawn', async () => {
    const b = await pdeBooking();
    const day = dayOf(b.startsAt);
    const [u] = await fromVigie();
    as('facility_manager');
    expect(await removeUnavailabilityAction(u.id)).toEqual({ ok: false, error: 'This unavailability comes from Vigie: the intervention is changed there' });
    const flagged = await t.db.$count(notifications, eq(notifications.kind, 'outside_works'));
    await publish(row(7, 12, day, day, 'Câblage et essais'));
    expect(await read()).toMatchObject({ changed: 1 });
    expect((await fromVigie())[0].label).toBe('Vigie · Elec Est · Câblage et essais · 08:00-12:00');
    // Only its text changed: the bookings are not flagged again.
    expect(await t.db.$count(notifications, eq(notifications.kind, 'outside_works'))).toBe(flagged);
    await publish(row(8, 99, day, day));
    expect(await read()).toMatchObject({ removed: 1 });
    expect(await fromVigie()).toEqual([]);
    expect((await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'vigie.pub_suspensions_essais'))).length).toBe(3);
  });
});
