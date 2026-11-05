// Reading the other tools' views (CR-060) on a fresh PostgreSQL database with the demo data set: the views are stood up as the
// owning tools publish them (keystone.pub_jalons, cursus.pub_absences, vigie.pub_controles, granted to crucible_app), then read.
// - a view not published or not granted is a state: nothing read, nothing changed;
// - Keystone milestones of a linked project are added, changed and removed with Keystone, an undated one is skipped and a
//   milestone a need serves is kept; they cannot be changed in Crucible;
// - Cursus absences (validated and requested, not cancelled) replace those read before; they cannot be removed in Crucible;
// - Vigie controls of a resource (by its code) become its inspections — an inspection entered with the same label becomes
//   Vigie's —, an archived or withdrawn control no longer applies; it cannot be recorded in Crucible;
// - the screen's action: who may run it, the report lines; every read is audited.
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

import { and, eq } from 'drizzle-orm';
import { createSiteAction, linkMatrixAction } from '@/features/admin/actions';
import { readConnectorsAction } from '@/features/admin/connectors';
import { updateMilestoneAction } from '@/features/needs/actions';
import { removeAbsenceAction } from '@/features/planning/actions';
import { recordInspectionAction } from '@/features/resources/actions';
import { auditEntries, entities, inspections, people, sites, personAbsences, projectMilestones, projects, resources, testNeeds } from '@/server/db/schema';
import { keystoneRdProjectsToAdd, matrixReferentials, readConnectors } from '@/server/integrations/connectors';
import { testDatabase, type TestDatabase } from '@/test/db';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase();
  await t.db.update(projects).set({ keystoneCode: 'HLT-026' }).where(eq(projects.code, 'RD-ORION'));
});
afterAll(async () => t.close());
beforeEach(() => jar.clear());

const as = (role: string) => jar.set('crucible-role', role);
const by = { name: 'Test', userId: null, role: null };
const read = () => t.db.transaction((tx) => readConnectors(tx, by));
const readOf = async (view: string) => (await read()).find((r) => r.view === view)!;
const admin = async (q: string) => {
  const c = new pg.Client({ connectionString: t.url });
  await c.connect();
  try {
    await c.query(q);
  } finally {
    await c.end();
  }
};
/** Publishes a view of another tool, as its owner would, granted to Crucible (the rows given as a VALUES list). */
const publish = (view: string, columns: string, values: string) =>
  admin(`create schema if not exists ${view.split('.')[0]};
    create or replace view ${view} as select * from (values ${values}) v(${columns});
    grant usage on schema ${view.split('.')[0]} to ${t.role}; grant select on ${view} to ${t.role};`);
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const fromKeystone = () => t.db.select().from(projectMilestones).where(eq(projectMilestones.source, 'keystone'));

describe('views not published yet', () => {
  it('nothing is read nor changed; the screen says so', async () => {
    const before = (await t.db.select().from(auditEntries)).length;
    expect((await read()).map((r) => [r.view, r.readable])).toEqual([['keystone.pub_projets', false], ['keystone.pub_jalons', false], ['cursus.pub_salaries', false], ['cursus.pub_absences', false], ['vigie.pub_controles', false], ['matrix.pub_sites', false], ['matrix.pub_filiales', false]]);
    expect((await t.db.select().from(auditEntries)).length).toBe(before);
    as('admin');
    expect(await readConnectorsAction()).toEqual({ ok: true, warnings: ['Keystone projects · not readable yet', 'Keystone milestones · not readable yet', 'Cursus employees · not readable yet', 'Cursus absences · not readable yet', 'Vigie inspections · not readable yet', 'Matrix sites · not readable yet', 'Matrix subsidiaries · not readable yet'] });
  });

  it('a view published but not granted to Crucible is not read', async () => {
    await admin(`create schema keystone; create view keystone.pub_jalons as select 'HLT-026'::text as projet_code, 1 as jalon_id, 'x'::text as nom, null::date as date_fin_activite;`);
    expect((await readOf('keystone.pub_jalons')).readable).toBe(false);
  });
});

describe('Keystone milestones (S-2, K-2)', () => {
  it('the milestones of the linked project are added; an undated one and those of other projects are left out', async () => {
    await publish('keystone.pub_jalons', 'projet_code, jalon_id, nom, date_fin_activite',
      `('HLT-026', 11, 'Factory acceptance', date '2027-03-05'), ('HLT-026', 12, 'Site acceptance', null::date), ('NDC-031', 13, 'Other project', date '2027-01-10')`);
    const k = await readOf('keystone.pub_jalons');
    expect(k).toMatchObject({ readable: true, read: 2, added: 1, changed: 0, removed: 0, skipped: 1 });
    expect(await fromKeystone()).toMatchObject([{ projectCode: 'RD-ORION', label: 'Factory acceptance', dueOn: '2027-03-05', sourceRef: '11', updatedByName: 'Keystone' }]);
    const [a] = await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'keystone.pub_jalons'));
    expect(a.change).toBe('milestones read from Keystone: 1 added, 0 changed, 0 removed');
    // Read again, unchanged: nothing written, nothing audited.
    expect((await readOf('keystone.pub_jalons'))).toMatchObject({ added: 0, changed: 0, removed: 0 });
    expect((await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, 'keystone.pub_jalons'))).length).toBe(1);
  });

  it('cannot be changed in Crucible; follows Keystone; kept while a need serves it, removed after', async () => {
    const [m] = await fromKeystone();
    as('rd_director');
    expect(await updateMilestoneAction(null, form({ milestoneId: m.id, label: 'Changed here', dueOn: '2027-03-01', criticality: 'internal' }))).toEqual({ ok: false, error: 'This milestone comes from Keystone: change it there' });
    await publish('keystone.pub_jalons', 'projet_code, jalon_id, nom, date_fin_activite', `('HLT-026', 11, 'Factory acceptance (FAT)', date '2027-03-19')`);
    expect((await readOf('keystone.pub_jalons'))).toMatchObject({ changed: 1 });
    expect(await fromKeystone()).toMatchObject([{ id: m.id, label: 'Factory acceptance (FAT)', dueOn: '2027-03-19' }]);
    const [need] = await t.db.select().from(testNeeds).limit(1);
    await t.db.update(testNeeds).set({ milestoneId: m.id }).where(eq(testNeeds.id, need.id));
    await publish('keystone.pub_jalons', 'projet_code, jalon_id, nom, date_fin_activite', `('NDC-031', 13, 'Other project', date '2027-01-10')`);
    expect((await readOf('keystone.pub_jalons'))).toMatchObject({ removed: 0, skipped: 1 });
    expect(await fromKeystone()).toHaveLength(1);
    await t.db.update(testNeeds).set({ milestoneId: need.milestoneId }).where(eq(testNeeds.id, need.id));
    expect((await readOf('keystone.pub_jalons'))).toMatchObject({ removed: 1 });
    expect(await fromKeystone()).toHaveLength(0);
  });
});

describe('Cursus absences (CU-1)', () => {
  const karim = async () => (await t.db.select().from(people).where(eq(people.matricule, 'EP0388')))[0];
  const fromCursus = async () => t.db.select().from(personAbsences).where(and(eq(personAbsences.personId, (await karim()).id), eq(personAbsences.source, 'cursus')));

  it('validated and requested absences are read, cancelled ones and unknown matricules left out; the entered one stays', async () => {
    await publish('cursus.pub_absences', 'matricule, du, au, statut, annulee, maj_le',
      `('EP0388', date '2026-12-07', date '2026-12-11', 'validee', false, now()), ('EP0388', date '2027-01-04', date '2027-01-05', 'demandee', false, now()),
       ('EP0388', date '2026-11-02', date '2026-11-03', 'validee', true, now()), ('EP9999', date '2026-12-07', date '2026-12-08', 'validee', false, now())`);
    expect((await readOf('cursus.pub_absences'))).toMatchObject({ readable: true, read: 2, added: 2, removed: 0 });
    expect((await fromCursus()).map((a) => [a.fromOn, a.toOn]).sort()).toEqual([['2026-12-07', '2026-12-11'], ['2027-01-04', '2027-01-05']]);
    // The absence entered in Crucible by the demo stays.
    expect((await t.db.select().from(personAbsences).where(and(eq(personAbsences.personId, (await karim()).id), eq(personAbsences.source, 'crucible')))).length).toBe(1);
  });

  it('cannot be removed in Crucible; an absence cancelled in Cursus goes', async () => {
    const [a] = await fromCursus();
    as('coordinator');
    expect(await removeAbsenceAction(a.id)).toEqual({ ok: false, error: 'This absence comes from Cursus: change it there' });
    await publish('cursus.pub_absences', 'matricule, du, au, statut, annulee, maj_le',
      `('EP0388', date '2026-12-07', date '2026-12-11', 'validee', false, now()), ('EP0388', date '2027-01-04', date '2027-01-05', 'demandee', true, now())`);
    expect((await readOf('cursus.pub_absences'))).toMatchObject({ read: 1, added: 0, removed: 1 });
    expect((await fromCursus()).map((x) => x.fromOn)).toEqual(['2026-12-07']);
  });
});

describe('Vigie inspections (V-1, D23)', () => {
  const pil = async () => (await t.db.select().from(resources).where(eq(resources.code, 'PDE-PIL')))[0].id;
  const ofPil = async () => t.db.select().from(inspections).where(eq(inspections.resourceId, await pil()));

  it('the controls of a resource become its inspections; the one entered with the same label becomes Vigie’s', async () => {
    await publish('vigie.pub_controles', 'vigie_ref, equipement_code, type_controle, periodicite_mois, dernier_le, archive',
      `('41', 'PDE-PIL', 'Periodic check of the electrical installations', 12, date '2026-10-02', false), ('42', 'PDE-PIL', 'Lifting equipment', 6, date '2026-09-15', false),
       ('43', 'PDE-PIL', 'Never done', 12, null::date, false), ('44', 'BENCH-X', 'Other equipment', 12, date '2026-01-01', false)`);
    expect((await readOf('vigie.pub_controles'))).toMatchObject({ readable: true, read: 3, added: 1, changed: 1, skipped: 1 });
    const rows = (await ofPil()).sort((a, b) => a.label.localeCompare(b.label));
    expect(rows).toMatchObject([
      { label: 'Lifting equipment', periodMonths: 6, lastOn: '2026-09-15', source: 'vigie', sourceRef: '42', active: true },
      { label: 'Periodic check of the electrical installations', periodMonths: 12, lastOn: '2026-10-02', source: 'vigie', sourceRef: '41', active: true },
    ]);
  });

  it('cannot be recorded in Crucible; an archived or withdrawn control no longer applies', async () => {
    as('facility_manager');
    expect(await recordInspectionAction(null, form({ resourceId: await pil(), label: 'Lifting equipment', periodMonths: '6', lastOn: '2026-10-20' }))).toEqual({ ok: false, error: 'This inspection comes from Vigie: record it there' });
    await publish('vigie.pub_controles', 'vigie_ref, equipement_code, type_controle, periodicite_mois, dernier_le, archive',
      `('41', 'PDE-PIL', 'Periodic check of the electrical installations', 12, date '2026-10-02', true)`);
    expect((await readOf('vigie.pub_controles'))).toMatchObject({ read: 1, changed: 1, removed: 1 });
    expect((await ofPil()).every((i) => !i.active)).toBe(true);
  });
});

describe('the Connectors screen', () => {
  it('reads on demand for the administrator, the coordinator or the R&D director only', async () => {
    as('facility_manager');
    expect(await readConnectorsAction()).toEqual({ ok: false, error: 'Only the administrator, the coordinator or the R&D director reads the other tools' });
    as('coordinator');
    expect(await readConnectorsAction()).toEqual({ ok: true, warnings: [
      'Keystone projects · not readable yet',
      'Keystone milestones · 0 read · 0 added · 0 changed · 0 removed',
      'Cursus employees · not readable yet',
      'Cursus absences · 1 read · 0 added · 0 changed · 0 removed',
      'Vigie inspections · 1 read · 0 added · 0 changed · 0 removed',
      'Matrix sites · not readable yet',
      'Matrix subsidiaries · not readable yet',
    ] });
  });
});

describe('Keystone projects (S-1, K-3)', () => {
  it('a linked project takes its name from Keystone; R&D projects not in Crucible are offered; a closed one is flagged, not set aside', async () => {
    await publish('keystone.pub_projets', 'code, nom, imputable, categorie, filiale_code',
      `('HLT-026', 'Orion (Keystone)', true, 'rd', 'EPC2I'), ('KS-RD-9', 'Banc de vieillissement', true, 'rd', 'EPC2I'),
       ('KS-CL-1', 'Projet client', true, 'client', null), ('KS-RD-OLD', 'Ancien', false, 'rd', null)`);
    expect(await readOf('keystone.pub_projets')).toMatchObject({ readable: true, read: 1, changed: 1 });
    const [orion] = await t.db.select().from(projects).where(eq(projects.code, 'RD-ORION'));
    expect(orion).toMatchObject({ name: 'Orion (Keystone)', keystoneClosed: false, active: true });
    expect(await keystoneRdProjectsToAdd(t.db)).toEqual([{ code: 'KS-RD-9', name: 'Banc de vieillissement', entityCode: 'EPC2I' }]);
    expect(await readOf('keystone.pub_projets')).toMatchObject({ changed: 0 });

    await publish('keystone.pub_projets', 'code, nom, imputable, categorie, filiale_code', `('HLT-026', 'Orion (Keystone)', false, 'rd', 'EPC2I')`);
    expect(await readOf('keystone.pub_projets')).toMatchObject({ changed: 1 });
    expect((await t.db.select().from(projects).where(eq(projects.code, 'RD-ORION')))[0]).toMatchObject({ keystoneClosed: true, active: true });
    const [a] = await t.db.select().from(auditEntries).where(and(eq(auditEntries.objectRef, 'keystone.pub_projets'), eq(auditEntries.area, 'Projects')));
    expect(a.change).toContain('RD-ORION name "Orion" → "Orion (Keystone)"');
  });
});

describe('Cursus employees (S-3)', () => {
  it('the name follows Cursus; a person who has left is set aside, never put back by the read; an unknown matricule is skipped', async () => {
    await publish('cursus.pub_salaries', 'matricule, nom, actif', `('EP0412', 'Julien Masson', true), ('EP0388', 'Karim BENALI', true), ('EP0521', 'Sophie Lambert', false)`);
    expect(await readOf('cursus.pub_salaries')).toMatchObject({ readable: true, read: 3, changed: 1, removed: 1, skipped: 1 });
    const byMat = async (m: string) => (await t.db.select().from(people).where(eq(people.matricule, m)))[0];
    expect(await byMat('EP0388')).toMatchObject({ name: 'Karim BENALI', active: true });
    expect(await byMat('EP0521')).toMatchObject({ active: false });
    await publish('cursus.pub_salaries', 'matricule, nom, actif', `('EP0521', 'Sophie Lambert', true)`);
    expect(await readOf('cursus.pub_salaries')).toMatchObject({ changed: 0, removed: 0 });
    expect(await byMat('EP0521')).toMatchObject({ active: false });
  });
});

describe('Matrix sites and subsidiaries (D14, D21, M-6)', () => {
  it('a linked site and entity take their names from Matrix; the unlinked ones of Matrix are offered; linking and adding', async () => {
    await publish('matrix.pub_sites', 'code, libelle, ville, pays_iso2, ordre, actif',
      `('smc', 'Saint-Martin-de-Crau — EPC France (laboratoire 67, PDE)', 'Saint-Martin-de-Crau', 'FR', 40, true), ('lyon', 'Lyon — siège et atelier', 'Lyon', 'FR', 10, true), ('old', 'Fermé', null, 'FR', 90, false)`);
    await publish('matrix.pub_filiales', 'code, nom, ordre, actif', `('SMC', 'EPC France SAS', 10, true), ('MAR', 'EPC Maroc', 20, true)`);
    const reps = await read();
    expect(reps.find((r) => r.view === 'matrix.pub_sites')).toMatchObject({ readable: true, read: 1, changed: 1 });
    expect(reps.find((r) => r.view === 'matrix.pub_filiales')).toMatchObject({ readable: true, read: 1, changed: 1 });
    expect((await t.db.select().from(sites).where(eq(sites.code, 'RD-SITE')))[0]).toMatchObject({ name: 'Saint-Martin-de-Crau — EPC France (laboratoire 67, PDE)', city: 'Saint-Martin-de-Crau', matrixCode: 'smc' });
    expect((await t.db.select().from(entities).where(eq(entities.code, 'EPCFR')))[0].name).toBe('EPC France SAS');
    const ref = await matrixReferentials(t.db);
    expect(ref.sites.map((x) => [x.code, x.linkedTo])).toEqual([['lyon', null], ['smc', 'RD-SITE']]);
    expect(ref.subsidiaries.map((x) => [x.code, x.linkedTo])).toEqual([['SMC', 'EPCFR'], ['MAR', null]]);

    // The administrator only; a code already linked or unknown is refused; a site added from Matrix is linked to it.
    as('rd_director');
    expect(await linkMatrixAction(null, form({ kind: 'entity', code: 'EPC2I', matrixCode: 'MAR' }))).toMatchObject({ ok: false });
    as('admin');
    expect(await linkMatrixAction(null, form({ kind: 'entity', code: 'EPC2I', matrixCode: 'SMC' }))).toEqual({ ok: false, error: 'Choose a Matrix subsidiary not yet linked' });
    expect(await linkMatrixAction(null, form({ kind: 'site', code: 'RD-SITE', matrixCode: 'nowhere' }))).toEqual({ ok: false, error: 'Choose a Matrix site not yet linked' });
    expect(await createSiteAction(null, form({ code: 'LYON', name: 'Lyon', countryIso2: 'FR', matrixCode: 'lyon' }))).toEqual({ ok: true });
    expect((await t.db.select().from(sites).where(eq(sites.code, 'LYON')))[0].matrixCode).toBe('lyon');
    expect(await linkMatrixAction(null, form({ kind: 'site', code: 'RD-SITE', matrixCode: '' }))).toEqual({ ok: true });
    expect((await t.db.select().from(sites).where(eq(sites.code, 'RD-SITE')))[0].matrixCode).toBeNull();
    expect(await linkMatrixAction(null, form({ kind: 'site', code: 'RD-SITE', matrixCode: 'smc' }))).toEqual({ ok: true });
    const [a] = await t.db.select().from(auditEntries).where(and(eq(auditEntries.objectRef, 'Site RD-SITE'), eq(auditEntries.change, 'linked to Matrix smc')));
    expect(a).toBeTruthy();
  });
});
