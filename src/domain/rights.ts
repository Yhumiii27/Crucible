// Who sees which facility and which project (docs/spec/01-profils-droits.md §2, decision U-3). Pure rules shared by the data
// layer, which turns the visibility into SQL filters (src/server/dal/visibility.ts), and the tests, which run every profile
// against the demo data set. Visibility follows the assignments of the viewer's ACTIVE role: switching role changes what is
// seen.
import { PLANNING_ROLES, ROLE_SCOPE, type RoleKey } from '@/config/roles';

export interface RoleAssignment {
  role: RoleKey;
  scopeKind: import('@/config/roles').ScopeKind;
  /** Entity code, facility code or project code; null for a global assignment. */
  scopeRef: string | null;
}

/** The facility facts the rule needs. */
export interface FacilityScopeFacts {
  code: string;
  /** Entity that runs the facility. */
  operatorEntityCode: string;
  /** Partner entities the facility is shared with (laboratoire 67 → EPC France). */
  partnerEntityCodes: readonly string[];
}

/** The project facts the rule needs. */
export interface ProjectScopeFacts {
  code: string;
  entityCode: string;
  /** A confidential project shows as "Booked (confidential)" outside its team (U-3). */
  confidential: boolean;
}

/**
 * Facilities the viewer's active role sees:
 * - `all`: every facility (group-wide roles, the people of the facilities);
 * - `entities`: the facilities run by, or shared with, the listed entities (partner, reader);
 * - `none`: nothing (administrator: reference data only, or no valid assignment).
 */
export type FacilityVisibility = { kind: 'all' } | { kind: 'entities'; entities: string[] } | { kind: 'none' };

/**
 * Projects the viewer's active role sees in full (code, name, purpose of the tests):
 * - `all`: every project, confidential ones included (R&D director);
 * - `open`: every non-confidential project (coordinator, facility manager, safety officer);
 * - `scoped`: the listed projects (named team, confidential or not) and the non-confidential projects of the listed entities;
 * - `none`: nothing.
 */
export type ProjectVisibility =
  | { kind: 'all' }
  | { kind: 'open' }
  | { kind: 'scoped'; entities: string[]; projects: string[] }
  | { kind: 'none' };

/** An assignment is valid when its scope is the one its role is given at, with a reference unless global. */
export function isValidAssignment(a: RoleAssignment): boolean {
  if (ROLE_SCOPE[a.role] !== a.scopeKind) return false;
  return a.scopeKind === 'global' ? a.scopeRef == null : !!a.scopeRef?.trim();
}

const mineOf = (role: RoleKey, assignments: readonly RoleAssignment[]) => assignments.filter((a) => a.role === role && isValidAssignment(a));
const refsOf = (mine: readonly RoleAssignment[]) => [...new Set(mine.map((a) => a.scopeRef!))].sort();

/** Facility visibility of a viewer in `role`, from their assignments (invalid ones and other roles' are ignored). */
export function facilityVisibility(role: RoleKey, assignments: readonly RoleAssignment[]): FacilityVisibility {
  const mine = mineOf(role, assignments);
  if (!mine.length || role === 'admin') return { kind: 'none' };
  if (role === 'partner' || role === 'viewer') return { kind: 'entities', entities: refsOf(mine) };
  return { kind: 'all' };
}

/** Project visibility of a viewer in `role`. A project lead sees their projects; a technician sees projects through bookings (L2). */
export function projectVisibility(role: RoleKey, assignments: readonly RoleAssignment[]): ProjectVisibility {
  const mine = mineOf(role, assignments);
  if (!mine.length) return { kind: 'none' };
  if (role === 'rd_director') return { kind: 'all' };
  if (PLANNING_ROLES.includes(role)) return { kind: 'open' };
  if (role === 'project_lead') return { kind: 'scoped', entities: [], projects: refsOf(mine) };
  if (role === 'partner' || role === 'viewer') return { kind: 'scoped', entities: refsOf(mine), projects: [] };
  return { kind: 'none' };
}

/** True when the visibility includes the facility. */
export function canSeeFacility(v: FacilityVisibility, f: FacilityScopeFacts): boolean {
  switch (v.kind) {
    case 'all':
      return true;
    case 'none':
      return false;
    case 'entities':
      return v.entities.includes(f.operatorEntityCode) || f.partnerEntityCodes.some((e) => v.entities.includes(e));
  }
}

/** True when the visibility includes the project. */
export function canSeeProject(v: ProjectVisibility, p: ProjectScopeFacts): boolean {
  switch (v.kind) {
    case 'all':
      return true;
    case 'open':
      return !p.confidential;
    case 'none':
      return false;
    case 'scoped':
      return v.projects.includes(p.code) || (!p.confidential && v.entities.includes(p.entityCode));
  }
}

/** Facilities a viewer in `role` manages (writes on their resources and calendars, L2): their facility assignments. */
export function managedFacilities(role: RoleKey, assignments: readonly RoleAssignment[]): string[] {
  if (role !== 'facility_manager' && role !== 'coordinator') return [];
  return refsOf(mineOf(role, assignments));
}
