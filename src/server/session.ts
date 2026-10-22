import 'server-only';
// The viewer and their preferences (copied from Keystone's src/server/session.ts, adapted). Demo mode (CRUCIBLE_AUTH=demo, the
// default): the "View as" profile of the `crucible-role` cookie — the demonstration person who holds it —, the R&D director
// when none. Entra mode: the signed-in user, re-read from the database on every request; without a valid session
// the request is sent to the sign-in page (the proxy normally redirects first — this is the server-side check).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isRoleKey, type RoleKey } from '@/config/roles';
import { AUTH_PATHS } from '@/domain/auth';
import { DEFAULT_LANG, makeT, type Lang, type T } from '@/i18n/translate';
import { authMode } from '@/server/auth/config';
import { businessToday } from '@/server/clock';
import { accountByEmail, viewerOfAccount } from '@/server/dal/users';
import { DEMO_PEOPLE } from '@/server/db/seed/demo';
import type { Viewer } from '@/server/viewer';

export type { Viewer } from '@/server/viewer';

/** Cookie names of the preferences. */
export const COOKIE = {
  role: 'crucible-role',
  lang: 'crucible-lang',
} as const;

/** Default "View as" profile of the demo mode. */
export const DEFAULT_DEMO_ROLE: RoleKey = 'rd_director';

/** The demonstration person of a profile (the persona of "View as"). */
export const demoPersonOf = (role: RoleKey) => DEMO_PEOPLE.find((p) => p.key === role)!;

/** The demo personas, one per profile, in the registry order. */
export const DEMO_PERSONAS = DEMO_PEOPLE.filter((p) => isRoleKey(p.key));

export const getViewer = cache(async (): Promise<Viewer> => {
  if (authMode() === 'entra') {
    const { entraViewer } = await import('@/server/auth/viewer');
    const v = await entraViewer();
    if (!v) redirect(`${AUTH_PATHS.page}?error=session`);
    return v;
  }
  const c = (await cookies()).get(COOKIE.role)?.value;
  const role = isRoleKey(c) ? c : DEFAULT_DEMO_ROLE;
  const account = await accountByEmail(demoPersonOf(role).email, await businessToday());
  // The demo mode needs the demonstration data set (a production database has no persona).
  if (!account || !account.roles.includes(role)) throw new Error(`Demo mode: the database has no demonstration person for the profile "${role}" (CRUCIBLE_SEED=demo)`);
  return viewerOfAccount(account, role, true);
});

export const getLang = cache(async (): Promise<Lang> => {
  const v = (await cookies()).get(COOKIE.lang)?.value;
  return v === 'en' || v === 'fr' ? v : DEFAULT_LANG;
});

/** `{ lang, t }` for Server Components. */
export const getI18n = cache(async (): Promise<{ lang: Lang; t: T }> => {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
});
