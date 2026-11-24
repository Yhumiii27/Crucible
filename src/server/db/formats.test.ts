// Formats in the database (Norma §4): every value list of a CHECK (src/server/db/schema/_checks.ts) is the domain's own list,
// and a migrated database holds exactly these CHECKs. A state added in the code without a migration, or a migration that
// drifts from the code, breaks this test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabase, type TestDatabase } from '@/test/db';
import { ROLE_KEYS, SCOPE_KINDS } from '@/config/roles';
import { API_EVENT_KINDS } from '@/domain/api';
import type { TurnView } from '@/domain/assistant-answer';
import { FORM_STAGES } from '@/domain/booking-forms';
import { MOVE_KINDS } from '@/domain/consumables';
import { MAINTENANCE_KINDS } from '@/domain/maintenance';
import { MILESTONE_CRITICALITIES, NEED_LEVELS, NEED_STATUSES, type MilestoneSource } from '@/domain/needs';
import { DEVICE_KINDS, OCCUPANCY_EVENT_KINDS, OCCUPANCY_OUTCOMES } from '@/domain/occupancy';
import { ENTITY_KINDS, PRIORITY_CLASSES } from '@/domain/organisation';
import { CONFLICT_STATUSES, PRIORITY_CRITERIA, PROPOSAL_STATUSES, SUBSTITUTION_STATUSES } from '@/domain/planning-vocabulary';
import { RATE_BUCKETS } from '@/domain/rate-limit';
import { INCIDENT_KINDS, INCIDENT_STATUSES, NOTIFICATION_KINDS, SCENARIO_KINDS, SCENARIO_STATUSES } from '@/domain/recovery-vocabulary';
import { BOOKING_STATUSES, GRANULARITIES, RESOURCE_KINDS, RESOURCE_STATUSES, RULE_REASONS, RULE_STATUSES, UNAVAILABILITY_KINDS } from '@/domain/resources';
import { RESULT_OUTCOMES } from '@/domain/results';
import * as C from './schema/_checks';
import './schema';

/** Lists of the CHECKs that the domain types only as a union: the two must stay the same set (checked by tsc). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const typed: [Same<C.OneOf<typeof C.MILESTONE_SOURCES>, MilestoneSource>, Same<C.OneOf<typeof C.ASSISTANT_PROVIDERS>, TurnView['provider']>] = [true, true];

/** [list of the CHECK, the domain's list] — same values, same order. */
const SAME: [string, readonly unknown[], readonly unknown[]][] = [
  ['ROLE_KEYS', C.ROLE_KEYS, ROLE_KEYS],
  ['SCOPE_KINDS', C.SCOPE_KINDS, SCOPE_KINDS],
  ['ENTITY_KINDS', C.ENTITY_KINDS, ENTITY_KINDS],
  ['PRIORITY_CLASSES', C.PRIORITY_CLASSES, PRIORITY_CLASSES],
  ['RESOURCE_KINDS', C.RESOURCE_KINDS, RESOURCE_KINDS],
  ['RESOURCE_STATUSES', C.RESOURCE_STATUSES, RESOURCE_STATUSES],
  ['GRANULARITIES', C.GRANULARITIES, GRANULARITIES],
  ['UNAVAILABILITY_KINDS', C.UNAVAILABILITY_KINDS, UNAVAILABILITY_KINDS],
  ['RULE_REASONS', C.RULE_REASONS, RULE_REASONS],
  ['RULE_STATUSES', C.RULE_STATUSES, RULE_STATUSES],
  ['BOOKING_STATUSES', C.BOOKING_STATUSES, BOOKING_STATUSES],
  ['SUBSTITUTION_STATUSES', C.SUBSTITUTION_STATUSES, SUBSTITUTION_STATUSES],
  ['PROPOSAL_STATUSES', C.PROPOSAL_STATUSES, PROPOSAL_STATUSES],
  ['CONFLICT_STATUSES', C.CONFLICT_STATUSES, CONFLICT_STATUSES],
  ['PRIORITY_CRITERIA', C.PRIORITY_CRITERIA, PRIORITY_CRITERIA],
  ['API_EVENT_KINDS', C.API_EVENT_KINDS, API_EVENT_KINDS],
  ['MOVE_KINDS', C.MOVE_KINDS, MOVE_KINDS],
  ['FORM_STAGES', C.FORM_STAGES, FORM_STAGES],
  ['INCIDENT_KINDS', C.INCIDENT_KINDS, INCIDENT_KINDS],
  ['INCIDENT_STATUSES', C.INCIDENT_STATUSES, INCIDENT_STATUSES],
  ['SCENARIO_KINDS', C.SCENARIO_KINDS, SCENARIO_KINDS],
  ['SCENARIO_STATUSES', C.SCENARIO_STATUSES, SCENARIO_STATUSES],
  ['NOTIFICATION_KINDS', C.NOTIFICATION_KINDS, Object.keys(NOTIFICATION_KINDS)],
  ['MAINTENANCE_KINDS', C.MAINTENANCE_KINDS, MAINTENANCE_KINDS],
  ['DEVICE_KINDS', C.DEVICE_KINDS, DEVICE_KINDS],
  ['OCCUPANCY_EVENT_KINDS', C.OCCUPANCY_EVENT_KINDS, OCCUPANCY_EVENT_KINDS],
  ['OCCUPANCY_OUTCOMES', C.OCCUPANCY_OUTCOMES, OCCUPANCY_OUTCOMES],
  ['MILESTONE_CRITICALITIES', C.MILESTONE_CRITICALITIES, MILESTONE_CRITICALITIES],
  ['NEED_LEVELS', C.NEED_LEVELS, NEED_LEVELS],
  ['NEED_STATUSES', C.NEED_STATUSES, NEED_STATUSES],
  ['RATE_BUCKETS', C.RATE_BUCKETS, RATE_BUCKETS],
  ['RESULT_OUTCOMES', C.RESULT_OUTCOMES, RESULT_OUTCOMES],
];

describe('value lists of the CHECKs', () => {
  it.each(SAME)('%s is the list of the domain', (_name, check, domain) => {
    expect([...check]).toEqual([...domain]);
  });
  it('lists typed only as a union are the same set (tsc)', () => expect(typed).toEqual([true, true]));
});

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase({ seed: null });
});
afterAll(() => t.close());

/** The values of `col = ANY (ARRAY['a'::text, …])` or `col = ANY (ARRAY[6, 12])` as PostgreSQL prints a CHECK back. */
function valuesOf(def: string): (string | number)[] {
  const arr = /ARRAY\[(.*)\]/.exec(def)?.[1] ?? '';
  const texts = [...arr.matchAll(/'((?:[^']|'')*)'::text/g)].map((m) => m[1].replace(/''/g, "'"));
  return texts.length ? texts : arr.split(',').map((x) => Number(x.trim()));
}

describe('CHECKs of a migrated database', () => {
  it('holds every domain CHECK of the schema with its exact values, and none other', async () => {
    const { rows } = await t.handle.pool.query<{ name: string; def: string }>(
      `select conname as name, pg_get_constraintdef(oid) as def from pg_constraint where contype = 'c' and connamespace = 'crucible'::regnamespace`,
    );
    const db = new Map(rows.map((r) => [r.name, r.def]));
    for (const [name, values] of C.DOMAIN_CHECKS) {
      expect(db.has(name), `${name} missing: run npm run db:generate`).toBe(true);
      expect(valuesOf(db.get(name)!), name).toEqual([...values]);
    }
    const strays = rows.filter((r) => r.name.endsWith('_domain') && !C.DOMAIN_CHECKS.has(r.name)).map((r) => r.name);
    expect(strays).toEqual([]);
    expect(C.DOMAIN_CHECKS.size).toBeGreaterThan(40);
  });

  it('refuses a state the code does not know, a blank name and a malformed code', async () => {
    const q = (s: string) => t.handle.pool.query(s);
    await expect(q(`insert into crucible.entities (code, name, kind) values ('TST', 'Test', 'supplier')`)).rejects.toThrow(/entities_kind_domain/);
    await expect(q(`insert into crucible.entities (code, name, kind) values ('TST', ' ', 'partner')`)).rejects.toThrow(/entities_name_filled/);
    await expect(q(`insert into crucible.entities (code, name, kind) values ('tst', 'Test', 'partner')`)).rejects.toThrow(/entities_code_shape/);
    await q(`insert into crucible.entities (code, name, kind) values ('TST', 'Test', 'partner')`);
  });
});
