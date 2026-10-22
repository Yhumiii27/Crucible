import 'server-only';
// The signed-in viewer in Entra mode (copied from Keystone, R-038/R-039): the sealed session cookie names the user and the
// active role; the account is re-read from the database on every request (memoised per request by getViewer), so
// deactivating a user or removing a role assignment takes effect at once. Loaded by getViewer() only when CRUCIBLE_AUTH=entra.
import { cookies } from 'next/headers';
import { activeRoleOf } from '@/config/roles';
import { businessToday } from '@/server/clock';
import { getUserAccount, viewerOfAccount } from '@/server/dal/users';
import type { Viewer } from '@/server/viewer';
import { sessionConfig } from './config';
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
  const a = await getUserAccount(s.uid, await businessToday());
  if (!a || !a.active || a.entraObjectId !== s.oid) return null;
  const role = activeRoleOf(a.roles, s.role);
  return role ? viewerOfAccount(a, role, false) : null;
}
