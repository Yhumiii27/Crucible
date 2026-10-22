// Demonstration data set (T-7): the installations named by the R&D teams — laboratoire 67 (shared with EPC France) and the
// PDE, a single building whose zones (mechanical workshop, pilot, laboratory rooms) cannot work at the same time (P-2) —
// with fictitious people and projects, two entities (EPC2i, EPC France), one person per profile. No real person or project.
// The e-mail domains are reserved example domains. The PDE zones become bookable resources with delivery 2.
import type { RoleKey, ScopeKind } from '@/config/roles';
import type { PriorityClass } from '@/domain/organisation';
import { entities, facilities, facilityPartners, projects, roleAssignments, sites, users } from '../schema';
import type { Tx } from '../types';

export const DEMO_ENTITIES = [
  { code: 'EPC2I', name: 'EPC2i', kind: 'internal' },
  { code: 'EPCFR', name: 'EPC France', kind: 'partner' },
] as const;

export const DEMO_SITES = [{ code: 'RD-SITE', name: 'R&D test site (demo)', city: null, countryIso2: 'FR' }] as const;

export const DEMO_FACILITIES = [
  { code: 'LAB67', name: 'Laboratoire 67', siteCode: 'RD-SITE', operatorEntityCode: 'EPC2I', description: 'Shared laboratory', partners: ['EPCFR'] },
  { code: 'PDE', name: 'PDE', siteCode: 'RD-SITE', operatorEntityCode: 'EPC2I', description: 'Single building: mechanical workshop, pilot, laboratory rooms — one zone at a time', partners: [] },
] as const;

export const DEMO_PROJECTS: { code: string; name: string; entityCode: string; priorityClass: PriorityClass; confidential: boolean }[] = [
  { code: 'RD-ORION', name: 'Orion', entityCode: 'EPC2I', priorityClass: 'P1', confidential: false },
  { code: 'RD-VEGA', name: 'Vega', entityCode: 'EPC2I', priorityClass: 'P2', confidential: false },
  { code: 'RD-CASSIOPEE', name: 'Cassiopée', entityCode: 'EPC2I', priorityClass: 'P1', confidential: true },
  { code: 'FR-LYRA', name: 'Lyra', entityCode: 'EPCFR', priorityClass: 'P2', confidential: false },
];

interface DemoPerson {
  key: string;
  name: string;
  email: string;
  title: string;
  entity: string;
  roles: { role: RoleKey; scope: ScopeKind; ref: string | null }[];
}

const I = 'epc2i.example';
const F = 'epc-france.example';

/** One persona per profile (the "View as" list) first, then the other people of the data set. */
export const DEMO_PEOPLE: DemoPerson[] = [
  { key: 'rd_director', name: 'Hélène Marchal', email: `h.marchal@${I}`, title: 'Head of R&D', entity: 'EPC2I', roles: [{ role: 'rd_director', scope: 'global', ref: null }] },
  { key: 'coordinator', name: 'Antoine Leroy', email: `a.leroy@${I}`, title: 'Test resources coordinator', entity: 'EPC2I', roles: [{ role: 'coordinator', scope: 'facility', ref: 'LAB67' }, { role: 'coordinator', scope: 'facility', ref: 'PDE' }] },
  { key: 'safety', name: 'Nathalie Brun', email: `n.brun@${I}`, title: 'Pyrotechnic safety officer', entity: 'EPC2I', roles: [{ role: 'safety', scope: 'global', ref: null }] },
  { key: 'facility_manager', name: 'Damien Petit', email: `d.petit@${I}`, title: 'PDE manager', entity: 'EPC2I', roles: [{ role: 'facility_manager', scope: 'facility', ref: 'PDE' }] },
  { key: 'project_lead', name: 'Camille Fabre', email: `c.fabre@${I}`, title: 'R&D project lead', entity: 'EPC2I', roles: [{ role: 'project_lead', scope: 'project', ref: 'RD-ORION' }, { role: 'project_lead', scope: 'project', ref: 'RD-CASSIOPEE' }] },
  { key: 'technician', name: 'Julien Masson', email: `j.masson@${I}`, title: 'Test technician', entity: 'EPC2I', roles: [{ role: 'technician', scope: 'facility', ref: 'PDE' }] },
  { key: 'partner', name: 'Isabelle Garnier', email: `i.garnier@${F}`, title: 'R&D engineer, EPC France', entity: 'EPCFR', roles: [{ role: 'partner', scope: 'entity', ref: 'EPCFR' }] },
  { key: 'viewer', name: 'Olivier Caron', email: `o.caron@${I}`, title: 'Engineering manager', entity: 'EPC2I', roles: [{ role: 'viewer', scope: 'entity', ref: 'EPC2I' }] },
  { key: 'admin', name: 'Crucible administrator', email: `admin.crucible@${I}`, title: 'Crucible administrator', entity: 'EPC2I', roles: [{ role: 'admin', scope: 'global', ref: null }] },
  { key: 'lab67_manager', name: 'Sandrine Roux', email: `s.roux@${I}`, title: 'Laboratoire 67 manager', entity: 'EPC2I', roles: [{ role: 'facility_manager', scope: 'facility', ref: 'LAB67' }] },
  { key: 'vega_lead', name: 'Mehdi Arnaud', email: `m.arnaud@${I}`, title: 'R&D project lead', entity: 'EPC2I', roles: [{ role: 'project_lead', scope: 'project', ref: 'RD-VEGA' }] },
];

export async function seedDemo(tx: Tx): Promise<void> {
  await tx.insert(entities).values(DEMO_ENTITIES.map((e) => ({ ...e })));
  await tx.insert(sites).values(DEMO_SITES.map((s) => ({ ...s })));
  await tx.insert(facilities).values(DEMO_FACILITIES.map((f) => ({ code: f.code, name: f.name, siteCode: f.siteCode, operatorEntityCode: f.operatorEntityCode, description: f.description })));
  await tx.insert(facilityPartners).values(DEMO_FACILITIES.flatMap((f) => f.partners.map((entityCode) => ({ facilityCode: f.code, entityCode }))));
  await tx.insert(projects).values(DEMO_PROJECTS);
  const rows = await tx.insert(users).values(DEMO_PEOPLE.map((p) => ({ email: p.email, displayName: p.name, jobTitle: p.title, entityCode: p.entity })))
    .returning({ id: users.id, email: users.email });
  const idOf = new Map(rows.map((r) => [r.email, r.id]));
  await tx.insert(roleAssignments).values(DEMO_PEOPLE.flatMap((p) => p.roles.map((r) => ({
    userId: idOf.get(p.email)!, role: r.role, scopeKind: r.scope, scopeRef: r.ref, createdByName: 'Demonstration data set',
  }))));
}
