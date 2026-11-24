// Dark / light display (Norma 1.0): the suite's cookie epc2i-theme read by the server (getTheme, posed on <html> by the root
// layout), the cookie the header's toggle writes, and the toggle's place right of the FR / EN toggle.
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

  it('the root layout poses data-theme and the header puts the toggle right of the language toggle', () => {
    const layout = fs.readFileSync(path.join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/<html[^>]*data-theme=\{theme\}/);
    const header = fs.readFileSync(path.join(process.cwd(), 'src/components/app/shell/header-tools.tsx'), 'utf8');
    expect(header).toMatch(/<LangToggle lang=\{lang\} \/>\s*<ThemeToggle theme=\{theme\} \/>/);
  });
});
