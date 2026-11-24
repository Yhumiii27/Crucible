import 'server-only';
// The signed-in viewer in Entra mode (copied from Keystone, R-038/R-039): the sealed session cookie names the user and the
// active role; the account is re-read from the database on every request (memoised per request by getViewer), so
// deactivating a user or removing a role assignment takes effect at once. Loaded by getViewer() only when CRUCIBLE_AUTH=entra.
import { cookies } from 'next/headers';
import { activeRoleOf, type RoleKey } from '@/config/roles';
import { grantedRolesFromClavisAccess } from '@/domain/auth';
import { readClavisAccess } from '@/server/integrations/clavis/access';
import { businessToday } from '@/server/clock';
import { getUserAccount, viewerOfAccount } from '@/server/dal/users';
import type { Viewer } from '@/server/viewer';
import { accessFromClavis, sessionConfig } from './config';
import { readSession, type SessionData } from './session-cookie';

/** The session of this request (cookie only; null when absent, tampered with or expired). */
export async function currentSession(): Promise<SessionData | null> {
  const cfg = sessionConfig();
  return readSession(cfg, (await cookies()).get(cfg.cookieName)?.value);
}

/** The signed-in viewer, or null: no valid session, unknown or deactivated user, other Microsoft account, no role left. */
export async function entraViewer(): Promise<Viewer | null> {
  const s = await currentSession();
  if (!s) return null;
  // One database (CRUCIBLE_ACCESS_FROM_CLAVIS): the roles IT grants in Clavis are read on every request, so a withdrawn
  // access or a changed role applies at the next page (scoped roles still count through a Crucible assignment). A failed
  // read refuses.
  let granted: RoleKey[] | undefined;
  if (accessFromClavis()) {
    try {
      granted = grantedRolesFromClavisAccess(await readClavisAccess(s.oid));
    } catch (e) {
      console.error('[auth] clavis.pub_acces not read:', e instanceof Error ? e.message : e);
      return null;
    }
  }
  const a = await getUserAccount(s.uid, await businessToday(), undefined, granted);
  if (!a || !a.active || a.entraObjectId !== s.oid) return null;
  const role = activeRoleOf(a.roles, s.role);
  return role ? viewerOfAccount(a, role, false) : null;
}
