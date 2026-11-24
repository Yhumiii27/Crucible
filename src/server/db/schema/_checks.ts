// Formats in the database (Norma §4: "every column has its constraint — domain of a state, shape of a code, non-empty name,
// consistency between columns; the application checks too, for a clear message, never alone"). The value lists of the
// state columns live here, with no import, so that drizzle-kit loads the schema without the domain modules; the TypeScript
// types of the columns are derived from them (`$type<OneOf<typeof X>>()`), and src/server/db/formats.test.ts compares each
// list with the constant of the domain and with the CHECK of a migrated database (a value added in the code and not in a
// migration breaks the CI). A CHECK lets null through: `notNull()` says whether the column may be empty.
import { sql, type SQL } from 'drizzle-orm';
import { check, type PgColumn } from 'drizzle-orm/pg-core';

export type OneOf<T extends readonly unknown[]> = T[number];

// ── Value lists (same order as the domain constants) ──────────────────────────────────────────────────────────────────
export const ROLE_KEYS = ['rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'technician', 'partner', 'viewer', 'admin'] as const;
export const SCOPE_KINDS = ['global', 'entity', 'facility', 'project'] as const;
export const ENTITY_KINDS = ['internal', 'partner'] as const;
export const PRIORITY_CLASSES = ['P1', 'P2', 'P3'] as const;
export const RESOURCE_KINDS = ['zone', 'bench', 'machine', 'room', 'equipment'] as const;
export const RESOURCE_STATUSES = ['in_service', 'maintenance', 'out_of_service', 'retired'] as const;
export const GRANULARITIES = ['half_day', 'hour'] as const;
export const UNAVAILABILITY_KINDS = ['maintenance', 'inspection', 'breakdown', 'works', 'other'] as const;
export const UNAVAILABILITY_SOURCES = ['manual', 'vigie', 'incident'] as const;
export const INSPECTION_SOURCES = ['crucible', 'vigie'] as const;
export const RULE_REASONS = ['safety', 'shared_staff', 'energy', 'nuisance', 'other'] as const;
export const RULE_STATUSES = ['proposed', 'validated', 'retired'] as const;
export const BOOKING_STATUSES = ['requested', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'] as const;
export const BOOKING_SOURCES = ['crucible', 'import'] as const;
export const PERSON_SOURCES = ['crucible', 'cursus'] as const;
export const SUBSTITUTION_STATUSES = ['proposed', 'validated', 'retired'] as const;
export const PROPOSAL_STATUSES = ['proposed', 'accepted', 'rejected', 'superseded'] as const;
export const CONFLICT_STATUSES = ['open', 'decided', 'vetoed', 'obsolete'] as const;
export const CONFLICT_DECIDERS = ['coordinator', 'rd_director'] as const;
export const ARBITRATION_KINDS = ['decision', 'veto'] as const;
export const RUN_TRIGGERS = ['manual', 'nightly'] as const;
export const PRIORITY_CRITERIA = ['safety_regulatory', 'contractual', 'critical_milestone', 'priority_class', 'slack', 'seniority'] as const;
export const API_EVENT_KINDS = ['booking.requested', 'booking.confirmed', 'booking.in_progress', 'booking.done', 'booking.cancelled', 'booking.no_show', 'booking.moved', 'incident.open', 'incident.closed'] as const;
export const ASSISTANT_PROVIDERS = ['local', 'claude'] as const;
export const MOVE_KINDS = ['receipt', 'use', 'adjust', 'discard'] as const;
export const FORM_STAGES = ['before', 'after', 'incident'] as const;
export const INCIDENT_KINDS = ['breakdown', 'absence', 'urgency'] as const;
export const INCIDENT_STATUSES = ['open', 'closed'] as const;
export const SCENARIO_KINDS = ['recovery', 'urgency', 'what_if'] as const;
export const SCENARIO_STATUSES = ['submitted', 'accepted', 'rejected', 'simulation'] as const;
export const NOTIFICATION_KINDS = ['booking_confirmed', 'booking_cancelled', 'booking_moved', 'incident', 'scenario', 'conflict', 'conflict_overdue', 'recap', 'maintenance_due', 'form_incident', 'test_result', 'consumable_alert', 'outside_works'] as const;
export const MAINTENANCE_KINDS = ['preventive', 'calibration'] as const;
export const DEVICE_KINDS = ['kiosk', 'agent', 'interlock', 'badge'] as const;
export const OCCUPANCY_EVENT_KINDS = ['start', 'stop'] as const;
export const OCCUPANCY_OUTCOMES = ['started', 'ended', 'unbooked_start', 'unbooked_stop', 'ignored'] as const;
export const FEED_SCOPES = ['mine', 'resource'] as const;
export const MILESTONE_CRITICALITIES = ['contractual', 'regulatory', 'internal'] as const;
export const MILESTONE_SOURCES = ['crucible', 'keystone'] as const;
export const NEED_LEVELS = ['forecast', 'request'] as const;
export const NEED_STATUSES = ['open', 'withdrawn'] as const;
export const JOB_STATUSES = ['ok', 'error'] as const;
export const RATE_BUCKETS = ['sign_in', 'search', 'export', 'assistant', 'device', 'calendar', 'api'] as const;
export const RESULT_OUTCOMES = ['pass', 'fail', 'retest', 'inconclusive'] as const;

// ── Shapes ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Codes typed in the administration (entities, sites, facilities, projects, resources, skills, test types…). */
export const CODE_RE = '^[A-Z0-9][A-Z0-9-]{1,23}$';
export const COUNTRY_RE = '^[A-Z]{2}$';
/** "B-2026-0042", "N-2026-0007", "AL-2026-0001"… */
export const refRe = (prefix: string) => `^${prefix}-[0-9]{4}-[0-9]{4,}$`;
/** "08:00". */
export const TIME_RE = '^([01][0-9]|2[0-3]):[0-5][0-9]$';
export const SHA256_RE = '^[0-9a-f]{64}$';

// ── Builders ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const lit = (v: string | number) => (typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

/** Every domain CHECK declared by the schema (name → values), compared with the database by formats.test.ts. */
export const DOMAIN_CHECKS = new Map<string, readonly (string | number)[]>();

/** The column takes one of the values (null passes). */
export function oneOf(name: string, col: PgColumn, values: readonly (string | number)[]) {
  DOMAIN_CHECKS.set(name, values);
  return check(name, sql`${col} in (${sql.raw(values.map(lit).join(', '))})`);
}

/** A name or a text that is not blank. */
export const filled = (name: string, col: PgColumn) => check(name, sql`length(btrim(${col})) > 0`);

/** The text matches a POSIX regular expression. */
export const shaped = (name: string, col: PgColumn, re: string) => check(name, sql`${col} ~ ${sql.raw(lit(re))}`);

/** lo ≤ col ≤ hi (a bound may be null: no bound). */
export function within(name: string, col: PgColumn, lo: number | null, hi: number | null) {
  if (lo != null && hi != null) return check(name, sql`${col} between ${sql.raw(String(lo))} and ${sql.raw(String(hi))}`);
  if (lo != null) return check(name, sql`${col} >= ${sql.raw(String(lo))}`);
  return check(name, sql`${col} <= ${sql.raw(String(hi))}`);
}

/** Any other rule between columns. */
export const rule = (name: string, expr: SQL) => check(name, expr);

/** The columns are all null or all filled (an amount as typed in a currency, with the currency and its rate). */
export const together = (name: string, ...cols: PgColumn[]) =>
  check(name, sql`(${sql.join(cols.map((c) => sql`(${c} is null)::int`), sql` + `)}) in (0, ${sql.raw(String(cols.length))})`);
