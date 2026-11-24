// Roles granted by the central sign-in of Clavis: read from the token, applied directly when global, scoped roles only
// through a Crucible assignment and only while granted.
import { describe, expect, it } from 'vitest';
import { decideSignIn, effectiveAssignments, grantedRolesFromClaims, grantedRolesFromClavisAccess } from './auth';

describe('roles from the token', () => {
  it('reads Crucible role keys, case-insensitive, with an optional prefix, dropping the others', () => {
    expect(grantedRolesFromClaims({ roles: ['Crucible.Facility_Manager', 'admin', 'Matrix.Lecture', 42] })).toEqual(['facility_manager', 'admin']);
    expect(grantedRolesFromClaims({})).toEqual([]);
  });

  it('applies global roles directly and scoped ones only through an assignment of a granted role', () => {
    const stored = [
      { role: 'facility_manager' as const, scopeKind: 'facility' as const, scopeRef: 'PDE' },
      { role: 'project_lead' as const, scopeKind: 'project' as const, scopeRef: 'RD-ORION' },
      { role: 'rd_director' as const, scopeKind: 'global' as const, scopeRef: null },
    ];
    expect(effectiveAssignments(['safety', 'facility_manager'], stored)).toEqual([
      { role: 'safety', scopeKind: 'global', scopeRef: null },
      { role: 'facility_manager', scopeKind: 'facility', scopeRef: 'PDE' },
    ]);
    expect(effectiveAssignments(null, stored)).toEqual(stored);
  });

  it('creates an account for an unknown e-mail with a global role; refuses no role and a scope missing', () => {
    const base = { oid: 'o', email: 'a@b.example', byObjectId: null, byEmail: null, adminEmails: [] };
    expect(decideSignIn({ ...base, granted: ['safety'] })).toMatchObject({ ok: true, createFromToken: true, roles: ['safety'] });
    expect(decideSignIn({ ...base, granted: [] })).toEqual({ ok: false, reason: 'no_role' });
    expect(decideSignIn({ ...base, granted: ['technician'] })).toEqual({ ok: false, reason: 'no_scope' });
    expect(decideSignIn({ ...base, granted: null })).toEqual({ ok: false, reason: 'unknown_user' });
  });
});

describe('roles read in clavis.pub_acces (CRUCIBLE_ACCESS_FROM_CLAVIS)', () => {
  it('gives the role of the row only when the access opens now', () => {
    expect(grantedRolesFromClavisAccess({ role: 'safety', ouvert: true })).toEqual(['safety']);
    expect(grantedRolesFromClavisAccess({ role: 'rd_director', ouvert: false })).toEqual([]);
    expect(grantedRolesFromClavisAccess({ role: 'director', ouvert: true })).toEqual([]);
    expect(grantedRolesFromClavisAccess(null)).toEqual([]);
  });
});
