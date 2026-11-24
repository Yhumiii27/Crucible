// Dark / light display (Norma 1.0): the suite's cookie epc2i-theme read by the server (getTheme, posed on <html> by the root
// layout), the cookie the display switch writes, and the place of the language / display pair (Norma 2.0, charte/COQUE.md § 4).
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, THEME_COOKIE, themeCookie, themeOf } from '@norma/charte/ds/theme';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}));

describe('display theme', () => {
  beforeEach(() => jar.clear());

  it('reads the cookie: light only when asked, dark otherwise', () => {
    expect(THEME_COOKIE).toBe('epc2i-theme');
    expect(DEFAULT_THEME).toBe('dark');
    expect(themeOf('light')).toBe('light');
    expect(themeOf('dark')).toBe('dark');
    expect(themeOf(undefined)).toBe('dark');
    expect(themeOf('LIGHT')).toBe('dark');
    expect(themeOf('<script>')).toBe('dark');
  });

  it('writes a one-year cookie on the whole site', () => {
    expect(themeCookie('light')).toBe('epc2i-theme=light; path=/; max-age=31536000; samesite=lax');
    expect(themeCookie('dark')).toMatch(/^epc2i-theme=dark; path=\/; max-age=31536000/);
  });

  it('getTheme follows the request cookie', async () => {
    const { getTheme } = await import('./session');
    expect(await getTheme()).toBe('dark');
    jar.set(THEME_COOKIE, 'light');
    // getTheme is cached per request (React cache); outside a request each call reads again.
    expect(await getTheme()).toBe('light');
  });

  it('the root layout poses data-theme; the language / display pair (PrefsStack) is in the page header and the top bar only', () => {
    const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    const layout = read('src/app/layout.tsx');
    expect(layout).toMatch(/<html[^>]*data-theme=\{theme\}/);
    expect(layout).toMatch(/import '@norma\/charte\/coque\.css'/);
    expect(read('src/components/app/shell/prefs.tsx')).toMatch(/<PrefsStack lang=\{lang\} theme=\{theme\} onSelect=\{setLang\} \/>/);
    expect(read('src/components/app/shell/page-header.tsx')).toMatch(/prefs=\{<Prefs lang=\{lang\} theme=\{theme\} \/>\}/);
    expect(read('src/app/(app)/layout.tsx')).toMatch(/topbar=\{<TopBar lang=\{lang\} theme=\{theme\} \/>\}/);
    // Nowhere else: no other toggle of the language or the display in Crucible's code.
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const users = walk(path.join(process.cwd(), 'src')).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && /PrefsStack|ThemeToggle|ThemeSwitch|LangSwitch/.test(fs.readFileSync(f, 'utf8')));
    expect(users.map((f) => path.relative(process.cwd(), f))).toEqual(['src/components/app/shell/prefs.tsx']);
  });
});
