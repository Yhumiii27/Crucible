// Microsoft Entra ID sign-in end to end (derived from Keystone's R-038 test) against the in-process Entra double and a fresh
// PostgreSQL database — no network: the sign-in route (PKCE, state, nonce), the callback (session cookie, account linked to
// the Microsoft object id, audit), every refusal (unknown e-mail, no role, deactivated, other Microsoft account, forged
// state), the first administrator from CRUCIBLE_ADMIN_EMAILS, getViewer() on the session, the role switch, sign-out, and the
// demo mode.
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { desc, eq } from 'drizzle-orm';
import { setViewAs, switchRole } from '@/server/actions/preferences';
import { auditEntries, roleAssignments, users } from '@/server/db/schema';
import { getViewer } from '@/server/session';
import { testDatabase, type TestDatabase } from '@/test/db';
import { ENTRA_ENV, ORIGIN, createMockEntra, setCookies, type MockEntra } from '@/test/mock-entra';
import { clearOidcCache } from './oidc';
import { handleCallback, handleSignIn, handleSignOut } from './routes';

const SESSION = '__Host-crucible-session';
const TX = '__Host-crucible-signin';
let idp: MockEntra;
let t: TestDatabase;

const useEntra = (extra: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries({ ...ENTRA_ENV, ...extra })) vi.stubEnv(k, v);
};

/** Sign-in route → Microsoft (the double) → callback, as the browser would. */
async function signIn(claims: Record<string, unknown>, returnTo = '/facilities') {
  const start = await handleSignIn(new NextRequest(`${ORIGIN}/api/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`));
  const tx = setCookies(start)[TX].value;
  const { code, state } = idp.authorize(start.headers.get('location')!, claims);
  const res = await handleCallback(new NextRequest(`${ORIGIN}/api/auth/callback?code=${code}&state=${state}`, { headers: { cookie: `${TX}=${tx}` } }));
  return { start, res, cookies: setCookies(res), tx };
}

const useSession = (r: { cookies: ReturnType<typeof setCookies> }) => jar.set(SESSION, r.cookies[SESSION].value);
const lastAudit = async () => (await t.db.select().from(auditEntries).orderBy(desc(auditEntries.occurredAt)).limit(1))[0];
const userByEmail = async (email: string) => (await t.db.select().from(users).where(eq(users.email, email)))[0];

beforeAll(async () => {
  t = await testDatabase();
});
afterAll(() => t.close());

beforeEach(async () => {
  jar.clear();
  clearOidcCache();
  idp = await createMockEntra();
  vi.stubGlobal('fetch', idp.fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('demo mode (default)', () => {
  it('"View as" picks the demonstration person of a profile; the sign-in routes answer 404', async () => {
    expect(await getViewer()).toMatchObject({ role: 'rd_director', name: 'Hélène Marchal', demo: true });
    expect((await handleSignIn(new NextRequest(`${ORIGIN}/api/auth/sign-in`))).status).toBe(404);
    expect((await handleCallback(new NextRequest(`${ORIGIN}/api/auth/callback?code=x&state=y`))).status).toBe(404);
    expect((await handleSignOut(new NextRequest(`${ORIGIN}/api/auth/sign-out`, { method: 'POST' }))).status).toBe(404);
    expect(await setViewAs('coordinator')).toEqual({ ok: true });
    expect(jar.get('crucible-role')).toBe('coordinator');
    expect(await setViewAs('boss')).toEqual({ ok: false, error: 'Unknown profile' });
    expect((await switchRole('boss')).ok).toBe(false);
    expect(idp.calls).toEqual([]);
  });
});

describe('Entra ID sign-in', () => {
  beforeEach(() => useEntra());

  it('signs a registered account in by e-mail, links the Microsoft object id, audits, and returns to the page', async () => {
    const r = await signIn({ oid: 'oid-camille', preferred_username: 'C.Fabre@epc2i.example', name: 'Camille Fabre' });
    expect(r.res.status).toBe(302);
    expect(r.res.headers.get('location')).toBe(`${ORIGIN}/facilities`);
    expect(r.cookies[SESSION].attrs).toMatch(/httponly/);
    expect(r.cookies[TX].value).toBe('');
    const u = await userByEmail('c.fabre@epc2i.example');
    expect(u).toMatchObject({ entraObjectId: 'oid-camille', active: true });
    expect(u.lastSignInAt).toBeInstanceOf(Date);
    expect(await lastAudit()).toMatchObject({ actorName: 'Camille Fabre', change: 'Signed in', area: 'Sign-in' });

    useSession(r);
    jar.set('crucible-role', 'admin'); // ignored with Entra ID
    expect(await getViewer()).toMatchObject({ role: 'project_lead', roles: ['project_lead'], name: 'Camille Fabre', userId: u.id, demo: false });

    // Later sign-ins match the object id, whatever the e-mail claim says.
    jar.clear();
    const again = await signIn({ oid: 'oid-camille', preferred_username: 'camille@other.example' });
    expect(again.res.headers.get('location')).toBe(`${ORIGIN}/facilities`);
  });

  it('refuses an unknown e-mail, an account without role, a deactivated account and another Microsoft account', async () => {
    const unknown = await signIn({ oid: 'oid-x', email: 'nobody@epc2i.example' });
    expect(unknown.res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=unknown_user`);
    expect(await lastAudit()).toMatchObject({ change: 'Sign-in refused · Unknown e-mail' });

    const mehdi = await userByEmail('m.arnaud@epc2i.example');
    await t.db.update(users).set({ entraObjectId: 'oid-mehdi-elsewhere' }).where(eq(users.id, mehdi.id));
    expect((await signIn({ oid: 'oid-mehdi', email: 'm.arnaud@epc2i.example' })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=account_mismatch`);

    const sandrine = await userByEmail('s.roux@epc2i.example');
    await t.db.update(users).set({ active: false }).where(eq(users.id, sandrine.id));
    expect((await signIn({ oid: 'oid-sandrine', email: 's.roux@epc2i.example' })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=inactive`);

    const olivier = await userByEmail('o.caron@epc2i.example');
    await t.db.delete(roleAssignments).where(eq(roleAssignments.userId, olivier.id));
    expect((await signIn({ oid: 'oid-olivier', email: 'o.caron@epc2i.example' })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=no_role`);
  });

  it('creates the first administrator from CRUCIBLE_ADMIN_EMAILS', async () => {
    useEntra({ CRUCIBLE_ADMIN_EMAILS: 'it.admin@epc2i.example' });
    const r = await signIn({ oid: 'oid-it', email: 'IT.Admin@epc2i.example', name: 'IT Admin' });
    expect(r.res.headers.get('location')).toBe(`${ORIGIN}/facilities`);
    const u = await userByEmail('it.admin@epc2i.example');
    expect(u).toMatchObject({ displayName: 'IT Admin', entraObjectId: 'oid-it' });
    const roles = await t.db.select().from(roleAssignments).where(eq(roleAssignments.userId, u.id));
    expect(roles.map((x) => [x.role, x.scopeKind, x.scopeRef])).toEqual([['admin', 'global', null]]);
    useSession(r);
    expect(await getViewer()).toMatchObject({ role: 'admin', name: 'IT Admin' });
  });

  it('switches the active role among the roles held, refuses another one, and signs out', async () => {
    const antoine = await userByEmail('a.leroy@epc2i.example');
    await t.db.insert(roleAssignments).values({ userId: antoine.id, role: 'technician', scopeKind: 'facility', scopeRef: 'PDE', createdByName: 'Test' });
    const r = await signIn({ oid: 'oid-antoine', email: 'a.leroy@epc2i.example', name: 'Antoine Leroy' });
    useSession(r);
    expect(await getViewer()).toMatchObject({ role: 'coordinator', roles: ['coordinator', 'technician'] });
    expect(await switchRole('rd_director')).toEqual({ ok: false, error: 'You do not hold this role' });
    expect(await switchRole('technician')).toEqual({ ok: true });
    expect(await lastAudit()).toMatchObject({ change: 'active role: coordinator → technician', actorRole: 'technician' });

    const out = await handleSignOut(new NextRequest(`${ORIGIN}/api/auth/sign-out`, { method: 'POST', headers: { cookie: `${SESSION}=${jar.get(SESSION)}`, origin: ORIGIN } }));
    expect(out.status).toBe(303);
    expect(setCookies(out)[SESSION].value).toBe('');
    expect(await lastAudit()).toMatchObject({ change: 'Signed out', actorName: 'Antoine Leroy' });
    const cross = await handleSignOut(new NextRequest(`${ORIGIN}/api/auth/sign-out`, { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(cross.status).toBe(403);
  });

  it('refuses a callback whose state does not match the sign-in cookie', async () => {
    const start = await handleSignIn(new NextRequest(`${ORIGIN}/api/auth/sign-in`));
    const tx = setCookies(start)[TX].value;
    const { code } = idp.authorize(start.headers.get('location')!, { oid: 'o', email: 'a.leroy@epc2i.example' });
    const res = await handleCallback(new NextRequest(`${ORIGIN}/api/auth/callback?code=${code}&state=forged`, { headers: { cookie: `${TX}=${tx}` } }));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=state`);
  });
});
