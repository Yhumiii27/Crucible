// The viewer: who is looking, in which active role, with which role assignments (docs/spec/01). Demo personas
// (CRUCIBLE_AUTH=demo, "View as") and signed-in users (CRUCIBLE_AUTH=entra) have the same shape. Pure type module.
import type { RoleKey } from '@/config/roles';
import type { RoleAssignment } from '@/domain/rights';

export interface Viewer {
  userId: string;
  name: string;
  email: string;
  /** EN source string when it is a role name; the job title as typed otherwise. */
  title: string;
  initials: string;
  /** Active role: the screens, the visibility and the rights in force. */
  role: RoleKey;
  /** Every role the user holds, in priority order. */
  roles: RoleKey[];
  assignments: RoleAssignment[];
  entityCode: string | null;
  /** True for a demo persona ("View as"). */
  demo: boolean;
}

/** "Leïla Haddad" → "LH". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
