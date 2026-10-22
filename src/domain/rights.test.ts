// Visibility rules (docs/spec/01 §2, U-3): facilities and projects, profile by profile.
import { describe, expect, it } from 'vitest';
import {
  canRequestBooking, canSeeBookingDetail, canSeeFacility, canSeeProject, facilityVisibility, operatedFacilities, isValidAssignment, managedFacilities, projectVisibility,
  type FacilityScopeFacts, type ProjectScopeFacts, type RoleAssignment,
} from './rights';
import type { RoleKey } from '@/config/roles';

const lab67: FacilityScopeFacts = { code: 'LAB67', operatorEntityCode: 'EPC2I', partnerEntityCodes: ['EPCFR'] };
const pde: FacilityScopeFacts = { code: 'PDE', operatorEntityCode: 'EPC2I', partnerEntityCodes: [] };
const orion: ProjectScopeFacts = { code: 'RD-ORION', entityCode: 'EPC2I', confidential: false };
const cassiopee: ProjectScopeFacts = { code: 'RD-CASSIOPEE', entityCode: 'EPC2I', confidential: true };
const lyra: ProjectScopeFacts = { code: 'FR-LYRA', entityCode: 'EPCFR', confidential: false };

const seenFacilities = (role: RoleKey, a: RoleAssignment[]) => [lab67, pde].filter((f) => canSeeFacility(facilityVisibility(role, a), f)).map((f) => f.code);
const seenProjects = (role: RoleKey, a: RoleAssignment[]) => [orion, cassiopee, lyra].filter((p) => canSeeProject(projectVisibility(role, a), p)).map((p) => p.code);

describe('facility visibility', () => {
  it('the people of the group see every facility; the administrator none', () => {
    expect(seenFacilities('rd_director', [{ role: 'rd_director', scopeKind: 'global', scopeRef: null }])).toEqual(['LAB67', 'PDE']);
    expect(seenFacilities('technician', [{ role: 'technician', scopeKind: 'facility', scopeRef: 'PDE' }])).toEqual(['LAB67', 'PDE']);
    expect(seenFacilities('admin', [{ role: 'admin', scopeKind: 'global', scopeRef: null }])).toEqual([]);
  });

  it('a partner sees only the facilities shared with its entity (U-3)', () => {
    expect(seenFacilities('partner', [{ role: 'partner', scopeKind: 'entity', scopeRef: 'EPCFR' }])).toEqual(['LAB67']);
    expect(seenFacilities('viewer', [{ role: 'viewer', scopeKind: 'entity', scopeRef: 'EPC2I' }])).toEqual(['LAB67', 'PDE']);
  });
});

describe('project visibility', () => {
  it('the R&D director sees everything, confidential projects included', () => {
    expect(seenProjects('rd_director', [{ role: 'rd_director', scopeKind: 'global', scopeRef: null }])).toEqual(['RD-ORION', 'RD-CASSIOPEE', 'FR-LYRA']);
  });

  it('the planners see every non-confidential project of every entity', () => {
    for (const role of ['coordinator', 'facility_manager'] as const) expect(seenProjects(role, [{ role, scopeKind: 'facility', scopeRef: 'LAB67' }])).toEqual(['RD-ORION', 'FR-LYRA']);
    expect(seenProjects('safety', [{ role: 'safety', scopeKind: 'global', scopeRef: null }])).toEqual(['RD-ORION', 'FR-LYRA']);
  });

  it('a project lead sees their projects, confidential or not; a partner its entity only', () => {
    expect(seenProjects('project_lead', [{ role: 'project_lead', scopeKind: 'project', scopeRef: 'RD-CASSIOPEE' }])).toEqual(['RD-CASSIOPEE']);
    expect(seenProjects('partner', [{ role: 'partner', scopeKind: 'entity', scopeRef: 'EPCFR' }])).toEqual(['FR-LYRA']);
    expect(seenProjects('viewer', [{ role: 'viewer', scopeKind: 'entity', scopeRef: 'EPC2I' }])).toEqual(['RD-ORION']);
    expect(seenProjects('technician', [{ role: 'technician', scopeKind: 'facility', scopeRef: 'PDE' }])).toEqual([]);
  });

  it('visibility follows the active role only', () => {
    const both: RoleAssignment[] = [
      { role: 'project_lead', scopeKind: 'project', scopeRef: 'RD-CASSIOPEE' },
      { role: 'viewer', scopeKind: 'entity', scopeRef: 'EPCFR' },
    ];
    expect(seenProjects('project_lead', both)).toEqual(['RD-CASSIOPEE']);
    expect(seenProjects('viewer', both)).toEqual(['FR-LYRA']);
    expect(seenProjects('rd_director', both)).toEqual([]);
  });

  it('assignments at another scope than their role’s are ignored', () => {
    expect(isValidAssignment({ role: 'rd_director', scopeKind: 'entity', scopeRef: 'EPC2I' })).toBe(false);
    expect(isValidAssignment({ role: 'partner', scopeKind: 'entity', scopeRef: ' ' })).toBe(false);
    expect(isValidAssignment({ role: 'technician', scopeKind: 'facility', scopeRef: 'PDE' })).toBe(true);
  });

  it('facilities managed: the facility manager’s and the coordinator’s assignments', () => {
    const a: RoleAssignment[] = [{ role: 'facility_manager', scopeKind: 'facility', scopeRef: 'PDE' }, { role: 'technician', scopeKind: 'facility', scopeRef: 'LAB67' }];
    expect(managedFacilities('facility_manager', a)).toEqual(['PDE']);
    expect(managedFacilities('technician', a)).toEqual([]);
  });
});


describe('booking rights', () => {
  const lab = (role: RoleKey, ref: string | null, scopeKind: RoleAssignment['scopeKind']): RoleAssignment[] => [{ role, scopeKind, scopeRef: ref }];
  it('who may request a slot', () => {
    expect(canRequestBooking('facility_manager', lab('facility_manager', 'PDE', 'facility'), pde, orion)).toBe(true);
    expect(canRequestBooking('facility_manager', lab('facility_manager', 'PDE', 'facility'), lab67, orion)).toBe(false);
    expect(canRequestBooking('coordinator', lab('coordinator', 'PDE', 'facility'), pde, cassiopee)).toBe(false);
    expect(canRequestBooking('project_lead', lab('project_lead', 'RD-CASSIOPEE', 'project'), pde, cassiopee)).toBe(true);
    expect(canRequestBooking('project_lead', lab('project_lead', 'RD-CASSIOPEE', 'project'), pde, orion)).toBe(false);
    expect(canRequestBooking('partner', lab('partner', 'EPCFR', 'entity'), lab67, lyra)).toBe(true);
    expect(canRequestBooking('partner', lab('partner', 'EPCFR', 'entity'), pde, lyra)).toBe(false);
    expect(canRequestBooking('rd_director', lab('rd_director', null, 'global'), pde, orion)).toBe(false);
  });

  it('what a booking shows (U-3): the project to those who see it, "booked" to the others', () => {
    expect(canSeeBookingDetail('partner', lab('partner', 'EPCFR', 'entity'), 'LAB67', orion)).toBe(false);
    expect(canSeeBookingDetail('partner', lab('partner', 'EPCFR', 'entity'), 'LAB67', lyra)).toBe(true);
    expect(canSeeBookingDetail('technician', lab('technician', 'PDE', 'facility'), 'PDE', orion)).toBe(true);
    expect(canSeeBookingDetail('technician', lab('technician', 'PDE', 'facility'), 'PDE', cassiopee)).toBe(false);
    expect(canSeeBookingDetail('technician', lab('technician', 'PDE', 'facility'), 'LAB67', orion)).toBe(false);
    expect(operatedFacilities('technician', lab('technician', 'PDE', 'facility'))).toEqual(['PDE']);
  });
});
