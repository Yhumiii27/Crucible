import { describe, expect, it } from 'vitest';
import { buildNav } from './nav-model';

describe('sidebar model', () => {
  it('a project lead: Home and their needs, planning, reference; no administration', () => {
    const home = buildNav('project_lead', '/');
    expect(home.fixed.map((e) => e.id)).toEqual(['home', 'notifications', 'my-needs']);
    expect(home.fixed[0].active).toBe(true);
    expect(home.sections.map((s) => s.key)).toEqual(['planning', 'reference']);
    const projects = buildNav('project_lead', '/projects');
    expect(projects.sections[1].entries.find((e) => e.active)?.id).toBe('projects');
  });

  it('the R&D director: planning, reference, steering and the organisation', () => {
    const nav = buildNav('rd_director', '/admin/organisation');
    expect(nav.sections.map((s) => s.key)).toEqual(['planning', 'reference', 'steering', 'admin']);
    expect(nav.sections[3].entries.map((e) => e.id)).toEqual(['admin-org']);
  });

  it('the administrator: Home and the administration only', () => {
    const nav = buildNav('admin', '/admin/users');
    expect(nav.fixed.map((e) => e.id)).toEqual(['home']);
    expect(nav.sections.map((s) => s.key)).toEqual(['admin']);
    expect(nav.sections[0].entries.find((e) => e.active)?.id).toBe('admin-users');
  });
});
