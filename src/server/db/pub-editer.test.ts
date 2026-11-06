// Edition from Matrix (Matrix's request M-19, 05/11/2026): crucible.pub_editer on a fresh PostgreSQL database with the demo data
// set. Reference tables open, with Crucible's checks (columns, enumerations, codes, names that follow another tool), « retirer »
// archives, every change audited with the person and the reason; bookings, the audit trail and accounts stay closed; the function
// is not executable by PUBLIC and runs with a fixed search_path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { auditEntries, entities, people, projects, resources } from '@/server/db/schema';
import { testDatabase, type TestDatabase } from '@/test/db';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase();
});
afterAll(async () => t.close());

const edit = async (table: string, action: string, key: unknown, values: unknown, motif = 'Correction demandée par le labo') => {
  const r = await t.db.execute(sql`select crucible.pub_editer(${table}, ${action}, ${key === null ? null : JSON.stringify(key)}::jsonb, ${values === null ? null : JSON.stringify(values)}::jsonb, ${'Ines Dupont'}, ${motif}) as row`);
  return (r.rows[0] as { row: Record<string, unknown> }).row;
};
const refused = async (p: Promise<unknown>, message: RegExp) => {
  const e = await p.then(() => null, (err: { cause?: { message?: string }; message?: string }) => err);
  expect(e?.cause?.message ?? e?.message).toMatch(message);
};

describe('crucible.pub_editer', () => {
  it('corrects a resource with Crucible’s checks; audited with the person and the reason', async () => {
    const row = await edit('resources', 'corriger', { code: 'PDE-LAB' }, { description: 'Salles du laboratoire', capacity: 2 });
    expect(row).toMatchObject({ code: 'PDE-LAB', description: 'Salles du laboratoire', capacity: 2 });
    const [r] = await t.db.select().from(resources).where(eq(resources.code, 'PDE-LAB'));
    expect(r.capacity).toBe(2);
    const [a] = await t.db.select().from(auditEntries).where(and(eq(auditEntries.objectRef, 'resources PDE-LAB'), eq(auditEntries.actorRole, 'matrix')));
    expect(a).toMatchObject({ actorName: 'Ines Dupont (Matrix)', change: 'edited from Matrix: corriger', area: 'Administration', reason: 'Correction demandée par le labo' });
    expect((a.before as { capacity: number }).capacity).toBe(1);
  });

  it('refuses unknown columns, the booking limits, wrong values, a missing reason, closed tables', async () => {
    await refused(edit('resources', 'corriger', { code: 'PDE-LAB' }, { buffer_minutes: 0 }), /n'est pas modifiable/);
    await refused(edit('resources', 'corriger', { code: 'PDE-LAB' }, { status: 'gone' }), /Valeur refusée/);
    await refused(edit('resources', 'corriger', { code: 'PDE-LAB' }, { code: 'PDE-X' }), /ne se modifie pas/);
    await refused(edit('resources', 'corriger', { code: 'PDE-LAB' }, { description: 'x' }, ' '), /motif est obligatoire/);
    await refused(edit('resources', 'corriger', { code: 'NOPE' }, { description: 'x' }), /introuvable/);
    for (const table of ['bookings', 'audit_entries', 'users', 'role_assignments', 'exclusion_rules', 'test_results', 'api_clients']) {
      await refused(edit(table, 'corriger', { id: 'x' }, { a: 1 }), /n'est pas modifiable depuis Matrix/);
    }
    await refused(edit('resources', 'supprimer', { code: 'PDE-LAB' }, null), /Action inconnue/);
  });

  it('adds an entity and a person; « retirer » archives, a site is never removed', async () => {
    expect(await edit('entities', 'ajouter', null, { code: 'EPCMA', name: 'EPC Maroc', kind: 'partner' })).toMatchObject({ code: 'EPCMA', active: true });
    await refused(edit('entities', 'ajouter', null, { code: 'epc ma', name: 'x', kind: 'partner' }), /Le code/);
    expect(await edit('entities', 'retirer', { code: 'EPCMA' }, null)).toMatchObject({ active: false });
    expect((await t.db.select().from(entities).where(eq(entities.code, 'EPCMA')))).toHaveLength(1);
    const p = await edit('people', 'ajouter', null, { name: 'Paul Arnaud', entity_code: 'EPC2I', facility_codes: ['PDE'] });
    expect(p).toMatchObject({ name: 'Paul Arnaud', updated_by_name: 'Ines Dupont (Matrix)', active: true });
    expect(await edit('people', 'retirer', { id: p.id }, null)).toMatchObject({ active: false });
    expect((await t.db.select().from(people).where(eq(people.id, String(p.id))))[0].active).toBe(false);
    await refused(edit('sites', 'retirer', { code: 'RD-SITE' }, null), /ne se retire pas/);
  });

  it('a name that follows another tool is changed there; other columns of the row stay open', async () => {
    await t.db.update(projects).set({ keystoneCode: 'HLT-026' }).where(eq(projects.code, 'RD-ORION'));
    await refused(edit('projects', 'corriger', { code: 'RD-ORION' }, { name: 'Autre' }), /suit un autre outil/);
    expect(await edit('projects', 'corriger', { code: 'RD-ORION' }, { priority_class: 'P2' })).toMatchObject({ priority_class: 'P2' });
    await refused(edit('entities', 'corriger', { code: 'EPCFR' }, { name: 'Autre' }), /suit un autre outil/);
  });

  it('is SECURITY DEFINER with a fixed search_path and not executable by PUBLIC', async () => {
    const r = await t.db.execute(sql`
      select p.prosecdef as definer, p.proconfig as config, has_function_privilege('public', p.oid, 'EXECUTE') as public_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crucible' and p.proname = 'pub_editer'`);
    expect(r.rows[0]).toMatchObject({ definer: true, config: ['search_path=crucible, pg_temp'], public_exec: false });
  });
});
