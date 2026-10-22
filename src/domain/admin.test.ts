import { describe, expect, it } from 'vitest';
import { checkAssignment, checkEntity, checkFacility, checkProject, checkSite, checkUser, selfLockout } from './admin';
import type { EntityKind } from './organisation';

const set = (...xs: string[]) => new Set(xs);
const entities = new Map<string, EntityKind>([['EPC2I', 'internal'], ['EPCFR', 'partner']]);
const ctx = { entities, facilities: set('LAB67', 'PDE'), projects: set('RD-ORION'), held: [] as { role: string; scopeRef: string | null }[] };

describe('administration checks', () => {
  it('accounts: valid unique e-mail, a name, a known entity', () => {
    const c = { takenEmails: set('a@b.example'), entities: set('EPC2I') };
    expect(checkUser({ email: ' New@B.example ', displayName: 'Ana Ruiz', entityCode: 'epc2i' }, c)).toEqual({ ok: true, value: { email: 'new@b.example', displayName: 'Ana Ruiz', jobTitle: null, entityCode: 'EPC2I' } });
    expect(checkUser({ email: 'A@b.example', displayName: 'X Y' }, c)).toEqual({ ok: false, error: 'An account already has this e-mail address' });
    expect(checkUser({ email: 'nope', displayName: 'X Y' }, c).ok).toBe(false);
    expect(checkUser({ email: 'z@b.example', displayName: 'X Y', entityCode: 'ZZZ' }, c)).toEqual({ ok: false, error: 'Unknown entity' });
  });

  it('role assignments: the scope comes from the role; the reference must exist; a partner gets a partner entity', () => {
    expect(checkAssignment({ role: 'rd_director', scopeRef: 'PDE' }, ctx)).toEqual({ ok: true, value: { role: 'rd_director', scopeKind: 'global', scopeRef: null } });
    expect(checkAssignment({ role: 'facility_manager', scopeRef: 'pde' }, ctx)).toEqual({ ok: true, value: { role: 'facility_manager', scopeKind: 'facility', scopeRef: 'PDE' } });
    expect(checkAssignment({ role: 'technician', scopeRef: 'XXX' }, ctx)).toEqual({ ok: false, error: 'Choose a facility' });
    expect(checkAssignment({ role: 'project_lead', scopeRef: 'rd-orion' }, ctx).ok).toBe(true);
    expect(checkAssignment({ role: 'project_lead', scopeRef: 'RD-VEGA' }, ctx)).toEqual({ ok: false, error: 'Choose a project' });
    expect(checkAssignment({ role: 'partner', scopeRef: 'EPCFR' }, ctx).ok).toBe(true);
    expect(checkAssignment({ role: 'partner', scopeRef: 'EPC2I' }, ctx)).toEqual({ ok: false, error: 'A partner contact is given a partner entity' });
    expect(checkAssignment({ role: 'viewer', scopeRef: 'EPC2I' }, ctx).ok).toBe(true);
    expect(checkAssignment({ role: 'boss' }, ctx)).toEqual({ ok: false, error: 'Choose a role' });
    expect(checkAssignment({ role: 'technician', scopeRef: 'PDE' }, { ...ctx, held: [{ role: 'technician', scopeRef: 'PDE' }] }).ok).toBe(false);
  });

  it('an administrator cannot lock themselves out', () => {
    const me = { actorUserId: 'u1', targetUserId: 'u1', actorAdminRoles: 1 };
    expect(selfLockout({ ...me, deactivating: true })).toBe('You cannot deactivate your own account');
    expect(selfLockout({ ...me, removingRole: 'admin' })).toBe('You cannot remove your own last administrator role');
    expect(selfLockout({ ...me, removingRole: 'admin', actorAdminRoles: 2 })).toBeNull();
    expect(selfLockout({ ...me, targetUserId: 'u2', deactivating: true })).toBeNull();
  });

  it('entities and sites', () => {
    expect(checkEntity({ code: 'epcbe', name: 'EPC Belgique', kind: 'partner' }, set('EPC2I'))).toEqual({ ok: true, value: { code: 'EPCBE', name: 'EPC Belgique', kind: 'partner' } });
    expect(checkEntity({ code: 'EPC2I', name: 'x y', kind: 'internal' }, set('EPC2I'))).toEqual({ ok: false, error: 'This code is already used' });
    expect(checkEntity({ code: 'X', name: 'x y', kind: 'internal' }, set()).ok).toBe(false);
    expect(checkEntity({ code: 'ABC', name: 'Abc', kind: 'other' }, set())).toEqual({ ok: false, error: 'Choose internal or partner' });
    expect(checkSite({ code: 'lyon', name: 'Lyon', city: 'Lyon' }, set())).toEqual({ ok: true, value: { code: 'LYON', name: 'Lyon', city: 'Lyon', countryIso2: 'FR' } });
    expect(checkSite({ code: 'LYON', name: 'Lyon', countryIso2: 'FRA' }, set()).ok).toBe(false);
  });

  it('facilities: a known site, run by an internal entity, shared with partners only', () => {
    const c = { taken: set('PDE'), sites: set('RD-SITE'), entities };
    expect(checkFacility({ code: 'atm', name: 'Atelier mécanique', siteCode: 'rd-site', operatorEntityCode: 'EPC2I', partnerEntityCodes: ['epcfr'] }, c))
      .toEqual({ ok: true, value: { code: 'ATM', name: 'Atelier mécanique', siteCode: 'RD-SITE', operatorEntityCode: 'EPC2I', description: null, partnerEntityCodes: ['EPCFR'] } });
    expect(checkFacility({ code: 'PDE', name: 'x y', siteCode: 'RD-SITE', operatorEntityCode: 'EPC2I' }, c)).toEqual({ ok: false, error: 'This code is already used' });
    expect(checkFacility({ code: 'ATM', name: 'Atelier', siteCode: 'NOWHERE', operatorEntityCode: 'EPC2I' }, c)).toEqual({ ok: false, error: 'Choose a site' });
    expect(checkFacility({ code: 'ATM', name: 'Atelier', siteCode: 'RD-SITE', operatorEntityCode: 'EPCFR' }, c)).toEqual({ ok: false, error: 'Choose the internal entity that runs the facility' });
    expect(checkFacility({ code: 'ATM', name: 'Atelier', siteCode: 'RD-SITE', operatorEntityCode: 'EPC2I', partnerEntityCodes: ['EPC2I'] }, c)).toEqual({ ok: false, error: 'A facility is shared with partner entities only' });
  });

  it('projects: an entity, a priority class, optional links', () => {
    const c = { taken: set('RD-ORION'), entities: set('EPC2I', 'EPCFR') };
    expect(checkProject({ code: 'rd-altair', name: 'Altair', entityCode: 'epc2i', priorityClass: 'p1', confidential: 'on', keystoneCode: 'hlt-026' }, c))
      .toEqual({ ok: true, value: { code: 'RD-ALTAIR', name: 'Altair', entityCode: 'EPC2I', priorityClass: 'P1', confidential: true, keystoneCode: 'HLT-026', codexProgramCode: null } });
    expect(checkProject({ code: 'RD-ALTAIR', name: 'Altair', entityCode: 'EPC2I' }, c)).toMatchObject({ ok: true, value: { priorityClass: 'P2', confidential: false } });
    expect(checkProject({ code: 'RD-ALTAIR', name: 'Altair', entityCode: 'EPC2I', priorityClass: 'P9' }, c)).toEqual({ ok: false, error: 'Choose a priority class' });
    expect(checkProject({ code: 'RD-ORION', name: 'Orion', entityCode: 'EPC2I' }, c).ok).toBe(false);
  });
});
