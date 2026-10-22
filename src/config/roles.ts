// Crucible profiles (docs/spec/01-profils-droits.md §1) and the scopes a role assignment carries (§2). Pure registry: no
// component, no server import, so server code, the proxy and scripts can load it.

/** Role keys, from the broadest workspace to the narrowest (a user holding several starts in the first one held). */
export const ROLE_KEYS = [
  'rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'technician', 'partner', 'viewer', 'admin',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const isRoleKey = (v: unknown): v is RoleKey => typeof v === 'string' && (ROLE_KEYS as readonly string[]).includes(v);

/** Role names (EN source strings, translated through t()). */
export const ROLE_LABEL: Record<RoleKey, string> = {
  rd_director: 'R&D director',
  coordinator: 'Test resources coordinator',
  safety: 'Safety officer',
  facility_manager: 'Facility manager',
  project_lead: 'R&D project lead',
  technician: 'Test technician',
  partner: 'Partner contact',
  viewer: 'Reader',
  admin: 'Administrator',
};

/**
 * What a role assignment is limited to (§2): the whole group, an entity (EPC2i, EPC France…), a facility (laboratoire 67,
 * PDE…) or a project (named team).
 */
export const SCOPE_KINDS = ['global', 'entity', 'facility', 'project'] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];

/** The scope each role is assigned at (an assignment at another scope is refused). */
export const ROLE_SCOPE: Record<RoleKey, ScopeKind> = {
  rd_director: 'global',
  safety: 'global',
  admin: 'global',
  coordinator: 'facility',
  facility_manager: 'facility',
  technician: 'facility',
  project_lead: 'project',
  partner: 'entity',
  viewer: 'entity',
};

/** Roles that see every non-confidential project of every entity (U-3: those who plan the shared facilities). */
export const PLANNING_ROLES: readonly RoleKey[] = ['coordinator', 'facility_manager', 'safety'];

/** Distinct known roles in priority order (unknown values dropped). */
export function sortRoles(roles: Iterable<unknown>): RoleKey[] {
  const held = new Set<string>();
  for (const r of roles) if (isRoleKey(r)) held.add(r);
  return ROLE_KEYS.filter((r) => held.has(r));
}

/** Active role: `preferred` when the user holds it, else the highest role held; null when the user holds none. */
export function activeRoleOf(roles: readonly string[], preferred?: string | null): RoleKey | null {
  const held = sortRoles(roles);
  if (preferred && isRoleKey(preferred) && held.includes(preferred)) return preferred;
  return held[0] ?? null;
}
