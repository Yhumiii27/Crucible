// The configuration schema — defaults, invalid values, production requirements, secrets kept out of messages (copied from
// Keystone, R-007, and adapted: PostgreSQL only, Crucible's variables).
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_VARIABLES, formatIssues, parseConfig, redactUrl } from './parse';

const cwd = '/srv/crucible';
const DB = 'postgres://crucible_app:s3cret-pw@db:5432/epc2i';
const parse = (env: Record<string, string | undefined>) => parseConfig({ DATABASE_URL: DB, ...env }, { cwd });
const vars = (issues: { variable: string }[]) => issues.map((i) => i.variable);

describe('parseConfig', () => {
  it('defaults: development, demo seed, info logs, pretty format, real clock', () => {
    const r = parse({});
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.config).toMatchObject({
      env: 'development', production: false, dataDir: path.join(cwd, '.data'), database: { url: DB, poolMax: 10 },
      seed: 'demo', seedExplicit: false, clock: null, log: { level: 'info', format: 'pretty' }, adminEmails: [],
    });
    // The database password is a secret the logger masks.
    expect(r.config.secrets).toEqual(['s3cret-pw']);
  });

  it('PostgreSQL only: DATABASE_URL is required, in every environment', () => {
    const r = parseConfig({}, { cwd });
    expect(vars(r.errors)).toEqual(['DATABASE_URL']);
    expect(r.config.database).toBeNull();
    expect(vars(parseConfig({ DATABASE_URL: 'mysql://db/crucible' }, { cwd }).errors)).toEqual(['DATABASE_URL']);
    expect(parse({ DATABASE_POOL_MAX: '25' }).config.database).toEqual({ url: DB, poolMax: 25 });
    expect(vars(parse({ DATABASE_POOL_MAX: '0' }).errors)).toEqual(['DATABASE_POOL_MAX']);
  });

  it('blank values count as unset', () => {
    const r = parse({ CRUCIBLE_SEED: ' ', LOG_LEVEL: '', CRUCIBLE_CLOCK: '' });
    expect(r.errors).toEqual([]);
    expect(r.config.seedExplicit).toBe(false);
    expect(r.config.clock).toBeNull();
  });

  it('invalid values are errors naming the variable, never its value; defaults are kept', () => {
    const r = parse({ CRUCIBLE_SEED: 'sample', LOG_LEVEL: 'chatty', CRUCIBLE_CLOCK: 'tomorrow', NEXT_PUBLIC_CODEX_URL: 'ftp://codex', CRUCIBLE_SESSION_SECRET: 'short-secret' });
    expect(vars(r.errors).sort()).toEqual(['CRUCIBLE_CLOCK', 'CRUCIBLE_SEED', 'CRUCIBLE_SESSION_SECRET', 'LOG_LEVEL', 'NEXT_PUBLIC_CODEX_URL']);
    expect(formatIssues(r.errors).join(' ')).not.toContain('short-secret');
    expect(r.config.seed).toBe('demo');
    expect(r.config.log.level).toBe('info');
  });

  it('a pinned clock, URLs without trailing slash', () => {
    expect(parse({ CRUCIBLE_CLOCK: '2026-10-22' }).config.clock).toEqual({ kind: 'fixed', iso: '2026-10-22' });
    expect(parse({ CRUCIBLE_CLOCK: 'real' }).config.clock).toEqual({ kind: 'real' });
    expect(parse({ NEXT_PUBLIC_KEYSTONE_URL: 'https://keystone.example/' }).errors).toEqual([]);
  });

  it('production: JSON logs, warnings for the sibling links and the implicit demo mode; a pinned clock is a warning', () => {
    const r = parse({ NODE_ENV: 'production', CRUCIBLE_CLOCK: '2026-10-22' });
    expect(r.errors).toEqual([]);
    expect(r.config.log.format).toBe('json');
    expect(vars(r.warnings)).toEqual(['NEXT_PUBLIC_KEYSTONE_URL', 'NEXT_PUBLIC_CODEX_URL', 'NEXT_PUBLIC_VIGIE_URL', 'CRUCIBLE_AUTH', 'CRUCIBLE_CLOCK']);
  });

  it('production with the production data set refuses the demo mode', () => {
    expect(vars(parse({ NODE_ENV: 'production', CRUCIBLE_SEED: 'production' }).errors)).toEqual(['CRUCIBLE_AUTH']);
    expect(vars(parse({ NODE_ENV: 'production', CRUCIBLE_SEED: 'production', CRUCIBLE_AUTH: 'demo' }).errors)).toEqual(['CRUCIBLE_AUTH']);
  });

  it('Entra sign-in needs its secret and app registration; the admin e-mails are normalised', () => {
    expect(vars(parse({ CRUCIBLE_AUTH: 'entra' }).errors)).toEqual(['CRUCIBLE_SESSION_SECRET', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'ENTRA_REDIRECT_URI', 'ENTRA_TENANT_ID']);
    const ok = parse({
      CRUCIBLE_AUTH: 'entra', CRUCIBLE_SESSION_SECRET: 'x'.repeat(40), ENTRA_CLIENT_ID: 'app', ENTRA_CLIENT_SECRET: 'client-secret-value',
      ENTRA_REDIRECT_URI: 'https://crucible.example/api/auth/callback', ENTRA_TENANT_ID: '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b',
      CRUCIBLE_ADMIN_EMAILS: ' Admin@Groupe.example, it@groupe.example,admin@groupe.example ',
    });
    expect(ok.errors).toEqual([]);
    expect(ok.config.adminEmails).toEqual(['admin@groupe.example', 'it@groupe.example']);
    expect(ok.config.secrets).toEqual(expect.arrayContaining(['x'.repeat(40), 'client-secret-value']));
    expect(vars(parse({ CRUCIBLE_ADMIN_EMAILS: 'not-an-address' }).errors)).toEqual(['CRUCIBLE_ADMIN_EMAILS']);
    expect(vars(parse({ CRUCIBLE_ADMIN_EMAILS: 'a@b.example' }).warnings)).toEqual(['CRUCIBLE_ADMIN_EMAILS']);
  });

  it('redactUrl hides the password; every variable is known', () => {
    expect(redactUrl(DB)).toBe('postgres://crucible_app:***@db:5432/epc2i');
    expect(redactUrl('nope')).toBe('[invalid URL]');
    expect(CONFIG_VARIABLES).toContain('DATABASE_URL');
    expect(CONFIG_VARIABLES.some((v) => v.startsWith('KEYSTONE_'))).toBe(false);
  });
});
