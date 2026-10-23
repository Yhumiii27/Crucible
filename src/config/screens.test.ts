import { describe, expect, it } from 'vitest';
import { ROLE_KEYS } from './roles';
import { BUILT, SCREENS, canSee, matchScreen, screenHref } from './screens';

describe('screen registry', () => {
  it('ids and paths are unique; every profile has at least Home', () => {
    expect(new Set(SCREENS.map((s) => s.id)).size).toBe(SCREENS.length);
    expect(new Set(SCREENS.map((s) => s.path)).size).toBe(SCREENS.length);
    for (const r of ROLE_KEYS) expect(canSee(r, 'home')).toBe(true);
  });

  it('builds hrefs and matches paths', () => {
    expect(screenHref('facilities')).toBe('/facilities');
    expect(screenHref('facility', { code: 'LAB67' })).toBe('/facilities/LAB67');
    expect(() => screenHref('facility')).toThrow();
    expect(matchScreen('/facilities/PDE')?.id).toBe('facility');
    expect(matchScreen('/facilities')?.id).toBe('facilities');
    expect(matchScreen('/admin/users')?.id).toBe('admin-users');
    expect(matchScreen('/my/schedule/')?.id).toBe('my-schedule');
    expect(matchScreen('/')?.id).toBe('home');
    expect(matchScreen('/nowhere')).toBeNull();
  });

  it('administration stays with the administrator; the administrator sees no business screen', () => {
    expect(canSee('admin', 'admin-users')).toBe(true);
    expect(canSee('admin', 'facilities')).toBe(false);
    expect(canSee('admin', 'planning')).toBe(false);
    expect(canSee('rd_director', 'admin-users')).toBe(false);
    expect(canSee('rd_director', 'admin-org')).toBe(true);
    expect(canSee('technician', 'projects')).toBe(false);
    expect([...BUILT].sort()).toEqual(['admin-connectors', 'admin-org', 'admin-users', 'conflicts', 'dashboard', 'decide', 'facilities', 'facility', 'home', 'incidents', 'load', 'my-needs', 'my-schedule', 'notifications', 'people', 'pilot', 'planning', 'project', 'projects', 'propose', 'rules']);
  });
});
