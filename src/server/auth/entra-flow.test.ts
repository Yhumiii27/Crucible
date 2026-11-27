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
import pg from 'pg';
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
    const r = await signIn({ oid: 'oid-camille', preferred_username: 'C.Fabre@atrium.example', name: 'Camille Fabre' });
    expect(r.res.status).toBe(302);
    expect(r.res.headers.get('location')).toBe(`${ORIGIN}/facilities`);
    expect(r.cookies[SESSION].attrs).toMatch(/httponly/);
    expect(r.cookies[TX].value).toBe('');
    const u = await userByEmail('c.fabre@atrium.example');
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
    const unknown = await signIn({ oid: 'oid-x', email: 'nobody@atrium.example' });
    expect(unknown.res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=unknown_user`);
    expect(await lastAudit()).toMatchObject({ change: 'Sign-in refused · Unknown e-mail' });

    const mehdi = await userByEmail('m.arnaud@atrium.example');
    await t.db.update(users).set({ entraObjectId: 'oid-mehdi-elsewhere' }).where(eq(users.id, mehdi.id));
    expect((await signIn({ oid: 'oid-mehdi', email: 'm.arnaud@atrium.example' })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=account_mismatch`);

    const sandrine = await userByEmail('s.roux@atrium.example');
    await t.db.update(users).set({ active: false }).where(eq(users.id, sandrine.id));
    expect((await signIn({ oid: 'oid-sandrine', email: 's.roux@atrium.example' })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=inactive`);

    const olivier = await userByEmail('o.caron@atrium.example');
    await t.db.delete(roleAssignments).where(eq(roleAssignments.userId, olivier.id));
    expect((await signIn({ oid: 'oid-olivier', email: 'o.caron@atrium.example' })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=no_role`);
  });

  it('creates the first administrator from CRUCIBLE_ADMIN_EMAILS', async () => {
    useEntra({ CRUCIBLE_ADMIN_EMAILS: 'it.admin@atrium.example' });
    const r = await signIn({ oid: 'oid-it', email: 'IT.Admin@atrium.example', name: 'IT Admin' });
    expect(r.res.headers.get('location')).toBe(`${ORIGIN}/facilities`);
    const u = await userByEmail('it.admin@atrium.example');
    expect(u).toMatchObject({ displayName: 'IT Admin', entraObjectId: 'oid-it' });
    const roles = await t.db.select().from(roleAssignments).where(eq(roleAssignments.userId, u.id));
    expect(roles.map((x) => [x.role, x.scopeKind, x.scopeRef])).toEqual([['admin', 'global', null]]);
    useSession(r);
    expect(await getViewer()).toMatchObject({ role: 'admin', name: 'IT Admin' });
  });

  it('switches the active role among the roles held, refuses another one, and signs out', async () => {
    const antoine = await userByEmail('a.leroy@atrium.example');
    await t.db.insert(roleAssignments).values({ userId: antoine.id, role: 'technician', scopeKind: 'facility', scopeRef: 'PDE', createdByName: 'Test' });
    const r = await signIn({ oid: 'oid-antoine', email: 'a.leroy@atrium.example', name: 'Antoine Leroy' });
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
    const { code } = idp.authorize(start.headers.get('location')!, { oid: 'o', email: 'a.leroy@atrium.example' });
    const res = await handleCallback(new NextRequest(`${ORIGIN}/api/auth/callback?code=${code}&state=forged`, { headers: { cookie: `${TX}=${tx}` } }));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=state`);
  });
});

describe('rights read in the database (CRUCIBLE_ACCESS_FROM_CLAVIS=on)', () => {
  const OID = '4c8d2e1f-6a7b-4c9d-8e0f-1a2b3c4d5e6f';
  // Stand-in of the view Matrix publishes on the shared server (same columns Crucible reads), made as the administrator and
  // readable by crucible_app, as Matrix's link grants it.
  const admin = async (q: string, params: unknown[] = []) => {
    const c = new pg.Client({ connectionString: t.url });
    await c.connect();
    try {
      return await c.query(q, params);
    } finally {
      await c.end();
    }
  };
  beforeEach(async () => {
    useEntra({ CRUCIBLE_ACCESS_FROM_CLAVIS: 'on' });
    await admin(`drop schema if exists clavis cascade; create schema clavis;
      create table clavis.pub_acces (personne_id uuid, application text, autorise boolean, niveau text, domaine text, role text, ouvert boolean, maj_le timestamptz);
      grant usage on schema clavis to ${t.role}; grant select on clavis.pub_acces to ${t.role};`);
    await admin(`insert into clavis.pub_acces values ($1, 'crucible', true, 'referent', 'hse', 'safety', true, now()), ($1, 'keystone', true, 'admin', null, 'director', true, now())`, [OID]);
  });
  afterAll(async () => {
    await admin('drop schema if exists clavis cascade');
  });

  it('takes the role set in Clavis, not the token, and applies a change or a withdrawal at the next page', async () => {
    const r = await signIn({ oid: OID, email: 'db.reader@groupe.example', name: 'Db Reader', roles: ['admin'] });
    expect(r.res.headers.get('location')).toBe(`${ORIGIN}/facilities`);
    expect(await userByEmail('db.reader@groupe.example')).toMatchObject({ grantedRoles: ['safety'] });
    useSession(r);
    expect(await getViewer()).toMatchObject({ role: 'safety', roles: ['safety'] });
    await admin(`update clavis.pub_acces set role = 'rd_director' where application = 'crucible'`);
    expect(await getViewer()).toMatchObject({ role: 'rd_director', roles: ['rd_director'] });
    await admin(`update clavis.pub_acces set ouvert = false where application = 'crucible'`);
    await expect(getViewer()).rejects.toThrow(/REDIRECT:\/sign-in/);
    jar.clear();
    expect((await signIn({ oid: OID, email: 'db.reader@groupe.example', roles: ['admin'] })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=no_role`);
  });

  it('ignores the roles of the token when the access from Clavis is off: Crucible\'s own assignments rule', async () => {
    useEntra({ CRUCIBLE_ACCESS_FROM_CLAVIS: 'off' });
    const r = await signIn({ oid: 'oid-token-only', email: 'token.only@groupe.example', roles: ['admin', 'rd_director'] });
    expect(r.res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=unknown_user`);
    expect(await userByEmail('token.only@groupe.example')).toBeUndefined();
  });

  it('keeps a scoped role only while Clavis grants it; the facility still comes from the Crucible assignment', async () => {
    const DAMIEN = '7e1f3a2b-5c6d-4e8f-9a0b-1c2d3e4f5a6b';
    await admin(`insert into clavis.pub_acces values ($1, 'crucible', true, 'gestion', null, 'Crucible.Facility_Manager', true, now())`, [DAMIEN]);
    const granted = await signIn({ oid: DAMIEN, preferred_username: 'd.petit@atrium.example', roles: ['admin'] });
    useSession(granted);
    const v = await getViewer();
    expect(v).toMatchObject({ role: 'facility_manager' });
    expect(v.assignments).toEqual([{ role: 'facility_manager', scopeKind: 'facility', scopeRef: 'PDE' }]);
    await admin(`update clavis.pub_acces set role = 'rd_director' where personne_id = $1`, [DAMIEN]);
    expect(await getViewer()).toMatchObject({ role: 'rd_director', roles: ['rd_director'] });
  });

  it('refuses a person without a Crucible role in Clavis, and a scoped role nobody gave a scope to yet', async () => {
    const NONE = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
    const TECH = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
    await admin(`insert into clavis.pub_acces values ($1, 'crucible', true, 'contribution', null, 'technician', true, now())`, [TECH]);
    expect((await signIn({ oid: NONE, email: 'none@groupe.example', roles: ['admin'] })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=no_role`);
    expect((await signIn({ oid: TECH, email: 'new.tech@groupe.example', roles: ['admin'] })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=no_scope`);
    expect(await userByEmail('new.tech@groupe.example')).toBeUndefined();
  });

  it('refuses when the view cannot be read, never falling back to the token', async () => {
    await admin('drop schema clavis cascade');
    expect((await signIn({ oid: OID, email: 'db.reader2@groupe.example', roles: ['admin'] })).res.headers.get('location')).toBe(`${ORIGIN}/sign-in?error=failed`);
  });
});
