// Authentication configuration: demo by default, entra on demand, and every Entra variable validated (fail
// closed on a typo rather than run without authentication).
import { describe, expect, it } from 'vitest';
import { CLIENT_ID, ENTRA_ENV, ISSUER, TENANT } from '@/test/mock-entra';
import { AuthConfigError, authMode, entraConfig, sessionConfig } from './config';

describe('auth mode', () => {
  it('is demo by default and entra on demand; anything else is an error', () => {
    expect(authMode({})).toBe('demo');
    expect(authMode({ CRUCIBLE_AUTH: '' })).toBe('demo');
    expect(authMode({ CRUCIBLE_AUTH: 'demo' })).toBe('demo');
    expect(authMode({ CRUCIBLE_AUTH: ' Entra ' })).toBe('entra');
    expect(() => authMode({ CRUCIBLE_AUTH: 'none' })).toThrow(AuthConfigError);
  });

  it('is demo in the test environment (the "View as" cookie stays the session)', () => {
    expect(authMode()).toBe('demo');
  });
});

describe('session configuration', () => {
  it('needs a long secret and a sane lifetime', () => {
    expect(() => sessionConfig({})).toThrow(/CRUCIBLE_SESSION_SECRET/);
    expect(() => sessionConfig({ CRUCIBLE_SESSION_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() => sessionConfig({ ...ENTRA_ENV, CRUCIBLE_SESSION_HOURS: '0' })).toThrow(/between 1 and 168/);
    expect(() => sessionConfig({ ...ENTRA_ENV, CRUCIBLE_SESSION_HOURS: 'abc' })).toThrow(/between 1 and 168/);
    expect(sessionConfig({ ...ENTRA_ENV, CRUCIBLE_SESSION_HOURS: '8' }).maxAge).toBe(8 * 3600);
    expect(sessionConfig(ENTRA_ENV).maxAge).toBe(12 * 3600);
  });

  it('uses Secure __Host- cookies over https and plain names on http://localhost only', () => {
    expect(sessionConfig(ENTRA_ENV)).toMatchObject({ secure: true, cookieName: '__Host-crucible-session', txCookieName: '__Host-crucible-signin' });
    const local = sessionConfig({ ...ENTRA_ENV, ENTRA_REDIRECT_URI: 'http://localhost:3000/api/auth/callback' });
    expect(local).toMatchObject({ secure: false, cookieName: 'crucible-session', txCookieName: 'crucible-signin' });
    expect(() => sessionConfig({ ...ENTRA_ENV, ENTRA_REDIRECT_URI: 'http://crucible.groupe.fr/api/auth/callback' })).toThrow(/https/);
  });
});

describe('Entra configuration', () => {
  it('derives the v2.0 issuer from the tenant id and defaults the post-logout page', () => {
    const c = entraConfig(ENTRA_ENV);
    expect(c).toMatchObject({ issuer: ISSUER, tenantId: TENANT, clientId: CLIENT_ID, postLogoutRedirectUri: 'https://crucible.groupe.test/sign-in?signedOut=1' });
  });

  it('names the first missing or invalid variable', () => {
    const without = (k: string) => Object.fromEntries(Object.entries(ENTRA_ENV).filter(([key]) => key !== k));
    expect(() => entraConfig(without('ENTRA_CLIENT_ID'))).toThrow(/ENTRA_CLIENT_ID is required/);
    expect(() => entraConfig(without('ENTRA_CLIENT_SECRET'))).toThrow(/ENTRA_CLIENT_SECRET is required/);
    expect(() => entraConfig(without('ENTRA_REDIRECT_URI'))).toThrow(/ENTRA_REDIRECT_URI is required/);
    expect(() => entraConfig(without('ENTRA_TENANT_ID'))).toThrow(/ENTRA_TENANT_ID/);
    expect(() => entraConfig({ ...ENTRA_ENV, ENTRA_TENANT_ID: 'common' })).toThrow(/GUID/);
    expect(() => entraConfig({ ...ENTRA_ENV, ENTRA_ISSUER: 'http://idp.example.com' })).toThrow(/https/);
  });

  it('accepts an explicit issuer', () => {
    const c = entraConfig({ ...ENTRA_ENV, ENTRA_TENANT_ID: '', ENTRA_ISSUER: 'https://idp.example.com/tenant/v2.0/' });
    expect(c).toMatchObject({ issuer: 'https://idp.example.com/tenant/v2.0', tenantId: null });
  });
});
