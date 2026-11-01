import { describe, expect, it } from 'vitest';
import { buildNav, facilityCodeOf, swapFacilityInPath } from './nav-model';

const keys = (es: { key: string }[]) => es.map((e) => e.key);

describe('sidebar model (delivery 5b: themes, Facility section)', () => {
  it('a project lead: Home and their needs; planning by theme, the facility tabs, reference; no bell entry, no administration', () => {
    const home = buildNav('project_lead', '/');
    expect(keys(home.fixed)).toEqual(['home', 'my-needs']);
    expect(home.fixed[0].active).toBe(true);
    expect(home.sections.map((s) => s.key)).toEqual(['planning', 'facility', 'reference']);
    expect(home.sections[0].groups.map((g) => [g.label, keys(g.entries)])).toEqual([['Schedule & load', ['planning']], ['Proposals & arbitration', ['incidents']]]);
    expect(buildNav('project_lead', '/projects').sections[2].groups[0].entries.find((e) => e.active)?.key).toBe('projects');
  });

  it('the coordinator: "To decide", the arbitration theme, the tabs of the facility of the URL with the active one', () => {
    const nav = buildNav('coordinator', '/facilities/PDE', 'inspections', 'LAB67');
    expect(keys(nav.fixed)).toEqual(['home', 'my-schedule', 'decide']);
    expect(nav.facility).toBe('PDE');
    const fac = nav.sections.find((s) => s.key === 'facility')!;
    expect(fac.active).toBe(true);
    expect(fac.groups[0].entries.map((e) => [e.key, e.href, e.active])).toEqual([
      ['facility:resources', '/facilities/PDE', false],
      ['facility:calendar', '/facilities/PDE?tab=calendar', false],
      ['facility:inspections', '/facilities/PDE?tab=inspections', true],
      ['facility:maintenance', '/facilities/PDE?tab=maintenance', false],
      ['facility:equipment', '/facilities/PDE?tab=equipment', false],
      ['facility:measurement', '/facilities/PDE?tab=measurement', false],
    ]);
    // Elsewhere, the tabs point at the last facility used.
    expect(buildNav('coordinator', '/load', null, 'LAB67').sections.find((s) => s.key === 'facility')!.groups[0].entries[0].href).toBe('/facilities/LAB67');
    // Without one, they wait for a facility to be chosen.
    expect(buildNav('coordinator', '/load').sections.find((s) => s.key === 'facility')!.groups[0].entries[0].href).toBeNull();
  });

  it('the R&D director: planning, facility, reference, steering and the organisation', () => {
    const nav = buildNav('rd_director', '/admin/organisation');
    expect(nav.sections.map((s) => s.key)).toEqual(['planning', 'facility', 'reference', 'steering', 'admin']);
    expect(keys(nav.sections[4].groups[0].entries)).toEqual(['admin-org']);
    expect(nav.sections[4].active).toBe(true);
  });

  it('the administrator: Home and the administration only', () => {
    const nav = buildNav('admin', '/admin/users');
    expect(keys(nav.fixed)).toEqual(['home']);
    expect(nav.sections.map((s) => s.key)).toEqual(['admin']);
    expect(nav.sections[0].groups[0].entries.find((e) => e.active)?.key).toBe('admin-users');
  });

  it('the facility switcher keeps the tab of a facility sheet, and opens the first tab from elsewhere', () => {
    expect(facilityCodeOf('/facilities/LAB%2067')).toBe('LAB 67');
    expect(facilityCodeOf('/planning')).toBeNull();
    expect(swapFacilityInPath('/facilities/PDE', 'calendar', 'LAB67')).toBe('/facilities/LAB67?tab=calendar');
    expect(swapFacilityInPath('/facilities/PDE', 'nope', 'LAB67')).toBe('/facilities/LAB67');
    expect(swapFacilityInPath('/load', 'calendar', 'LAB67')).toBe('/facilities/LAB67');
  });
});
