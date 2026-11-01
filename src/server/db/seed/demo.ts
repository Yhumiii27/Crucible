// Demonstration data set (T-7): the installations named by the R&D teams — laboratoire 67 (shared with EPC France) and the
// PDE, a single building whose zones (mechanical workshop, pilot, laboratory rooms) cannot work at the same time (P-2) —
// with fictitious people and projects, two entities (EPC2i, EPC France), one person per profile. No real person or project.
// The e-mail domains are reserved example domains. Delivery 2 adds the resources (the three zones of the PDE, three means of
// laboratoire 67), the opening hours, the rule "one zone of the PDE at a time" validated by the safety officer, the agreement
// with EPC France, inspections, an unavailability and bookings around the demonstration date (Thu 22 Oct 2026): a history
// of done tests, today's, and requests and confirmations of the next weeks — one of which the PDE rule forbids. Delivery 3
// adds the milestones of the projects, a test type catalogue and test needs: forecasts that overload the PDE in the week of
// 14 Dec 2026 (a bottleneck signalled 8 weeks ahead), a request covered by its booking and a late request (F-5).
import type { RoleKey, ScopeKind } from '@/config/roles';
import type { PriorityClass } from '@/domain/organisation';
import type { MilestoneCriticality, NeedLevel } from '@/domain/needs';
import type { BookingStatus, Granularity, ResourceKind } from '@/domain/resources';
import { parisInstant } from '@/lib/dates';
import { eq } from 'drizzle-orm';
import {
  bookingEquipment, bookingStaff, mobileEquipment, people, personAbsences, personSkills, priorityRuleSets, skills, substitutions, testTypeEquipment, testTypeSkills,
  bookings, closures, projectMilestones, testNeeds, testTypes, entities, entityAgreements, exclusionRuleResources, exclusionRules, facilities, facilityHours, facilityPartners, inspections, projects,
  resources, roleAssignments, sites, unavailabilities, users,
} from '../schema';
import type { Tx } from '../types';

export const DEMO_ENTITIES = [
  { code: 'EPC2I', name: 'EPC2i', kind: 'internal' },
  { code: 'EPCFR', name: 'EPC France', kind: 'partner' },
] as const;

export const DEMO_SITES = [{ code: 'RD-SITE', name: 'R&D test site (demo)', city: null, countryIso2: 'FR' }] as const;

export const DEMO_FACILITIES = [
  { code: 'LAB67', name: 'Laboratoire 67', siteCode: 'RD-SITE', operatorEntityCode: 'EPC2I', description: 'Shared laboratory', partners: ['EPCFR'], acquisitionKeur: 850 },
  { code: 'PDE', name: 'PDE', siteCode: 'RD-SITE', operatorEntityCode: 'EPC2I', description: 'Single building: mechanical workshop, pilot, laboratory rooms — one zone at a time', partners: [], acquisitionKeur: 3000 },
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
  await tx.insert(facilities).values(DEMO_FACILITIES.map((f) => ({ code: f.code, name: f.name, siteCode: f.siteCode, operatorEntityCode: f.operatorEntityCode, description: f.description, acquisitionKeur: f.acquisitionKeur })));
  await tx.insert(facilityPartners).values(DEMO_FACILITIES.flatMap((f) => f.partners.map((entityCode) => ({ facilityCode: f.code, entityCode }))));
  await tx.insert(projects).values(DEMO_PROJECTS);
  const rows = await tx.insert(users).values(DEMO_PEOPLE.map((p) => ({ email: p.email, displayName: p.name, jobTitle: p.title, entityCode: p.entity })))
    .returning({ id: users.id, email: users.email });
  const idOf = new Map(rows.map((r) => [r.email, r.id]));
  await tx.insert(roleAssignments).values(DEMO_PEOPLE.flatMap((p) => p.roles.map((r) => ({
    userId: idOf.get(p.email)!, role: r.role, scopeKind: r.scope, scopeRef: r.ref, createdByName: 'Demonstration data set',
  }))));
  await seedResources(tx, idOf);
  await seedPlanning(tx, idOf);
}

export const DEMO_RESOURCES: { code: string; facilityCode: string; name: string; kind: ResourceKind; granularity: Granularity; capacity: number; setupMinutes: number; teardownMinutes: number }[] = [
  { code: 'LAB67-ANA', facilityCode: 'LAB67', name: 'Analysis room', kind: 'room', granularity: 'half_day', capacity: 2, setupMinutes: 0, teardownMinutes: 0 },
  { code: 'LAB67-CLIM', facilityCode: 'LAB67', name: 'Climatic chamber', kind: 'equipment', granularity: 'half_day', capacity: 1, setupMinutes: 60, teardownMinutes: 60 },
  { code: 'LAB67-TRAC', facilityCode: 'LAB67', name: 'Tensile test bench', kind: 'bench', granularity: 'hour', capacity: 1, setupMinutes: 30, teardownMinutes: 15 },
  { code: 'PDE-ATM', facilityCode: 'PDE', name: 'Mechanical workshop', kind: 'zone', granularity: 'half_day', capacity: 1, setupMinutes: 0, teardownMinutes: 30 },
  { code: 'PDE-LAB', facilityCode: 'PDE', name: 'Laboratory rooms', kind: 'zone', granularity: 'half_day', capacity: 1, setupMinutes: 30, teardownMinutes: 30 },
  { code: 'PDE-PIL', facilityCode: 'PDE', name: 'Pilot', kind: 'zone', granularity: 'half_day', capacity: 1, setupMinutes: 90, teardownMinutes: 60 },
];

type Slot = [string, string, string, string];
const AM = (d: string): Slot => [d, '07:00', d, '12:00'];
const PM = (d: string): Slot => [d, '12:00', d, '17:00'];
const DAY = (d: string, to = d): Slot => [d, '07:00', to, '17:00'];

/** Bookings of the demo: resource, project, slot, status, purpose, actual times (done), requested on, requester key, need served. */
const DEMO_BOOKINGS: { r: string; p: string; slot: Slot; status: BookingStatus; title: string; actual?: [string, string]; on: string; by: string; need?: string }[] = [
  { r: 'PDE-PIL', p: 'RD-ORION', slot: DAY('2026-10-05'), status: 'done', title: 'Firing tests, series 1', actual: ['07:40', '15:30'], on: '2026-09-21', by: 'project_lead' },
  { r: 'PDE-ATM', p: 'RD-VEGA', slot: AM('2026-10-06'), status: 'done', title: 'Machining of test casings', actual: ['07:05', '11:50'], on: '2026-09-28', by: 'vega_lead' },
  { r: 'PDE-LAB', p: 'RD-CASSIOPEE', slot: DAY('2026-10-07'), status: 'done', title: 'Formulation trials', actual: ['07:30', '16:10'], on: '2026-09-25', by: 'project_lead' },
  { r: 'LAB67-TRAC', p: 'FR-LYRA', slot: ['2026-10-08', '09:00', '2026-10-08', '12:00'], status: 'done', title: 'Tensile tests on samples', actual: ['09:05', '11:40'], on: '2026-09-16', by: 'partner' },
  { r: 'PDE-PIL', p: 'RD-ORION', slot: DAY('2026-10-12', '2026-10-13'), status: 'done', title: 'Firing tests, series 1 (repeat)', actual: ['07:30', '16:20'], on: '2026-10-01', by: 'project_lead' },
  { r: 'LAB67-CLIM', p: 'FR-LYRA', slot: DAY('2026-10-12', '2026-10-14'), status: 'done', title: 'Ageing cycle', actual: ['07:10', '16:50'], on: '2026-09-14', by: 'partner' },
  { r: 'LAB67-TRAC', p: 'RD-VEGA', slot: ['2026-10-14', '13:00', '2026-10-14', '16:00'], status: 'no_show', title: 'Casing tensile tests', on: '2026-10-09', by: 'vega_lead' },
  { r: 'PDE-ATM', p: 'RD-VEGA', slot: DAY('2026-10-19'), status: 'done', title: 'Assembly of the test rig', actual: ['07:00', '16:30'], on: '2026-10-08', by: 'vega_lead' },
  { r: 'PDE-PIL', p: 'RD-ORION', slot: AM('2026-10-21'), status: 'done', title: 'Instrumentation check', actual: ['07:20', '11:45'], on: '2026-10-13', by: 'project_lead' },
  { r: 'PDE-LAB', p: 'RD-CASSIOPEE', slot: PM('2026-10-22'), status: 'confirmed', title: 'Stability measurements', on: '2026-10-12', by: 'project_lead' },
  { r: 'PDE-PIL', p: 'RD-ORION', slot: DAY('2026-10-27'), status: 'confirmed', title: 'Firing tests, series 2', on: '2026-10-09', by: 'project_lead', need: 'N-2026-0004' },
  { r: 'PDE-LAB', p: 'RD-CASSIOPEE', slot: AM('2026-10-27'), status: 'requested', title: 'Stability measurements, second run', on: '2026-10-08', by: 'project_lead' },
  { r: 'PDE-ATM', p: 'RD-VEGA', slot: AM('2026-10-28'), status: 'requested', title: 'Casing rework', on: '2026-10-20', by: 'vega_lead' },
  { r: 'LAB67-CLIM', p: 'FR-LYRA', slot: DAY('2026-10-28', '2026-10-29'), status: 'confirmed', title: 'Ageing cycle 2', on: '2026-10-02', by: 'partner' },
  { r: 'LAB67-TRAC', p: 'RD-ORION', slot: ['2026-10-29', '08:00', '2026-10-29', '11:00'], status: 'confirmed', title: 'Tensile tests on casings', on: '2026-10-14', by: 'project_lead' },
  { r: 'LAB67-ANA', p: 'FR-LYRA', slot: AM('2026-11-05'), status: 'requested', title: 'Residue analysis', on: '2026-10-21', by: 'partner' },
];

export const DEMO_MILESTONES: { key: string; p: string; label: string; dueOn: string; criticality: MilestoneCriticality }[] = [
  { key: 'orion-freeze', p: 'RD-ORION', label: 'Design freeze', dueOn: '2026-11-20', criticality: 'internal' },
  { key: 'orion-qual', p: 'RD-ORION', label: 'Qualification review', dueOn: '2027-01-15', criticality: 'contractual' },
  { key: 'vega-proto', p: 'RD-VEGA', label: 'Prototype ready', dueOn: '2026-12-21', criticality: 'internal' },
  { key: 'cass-safety', p: 'RD-CASSIOPEE', label: 'Safety file submitted', dueOn: '2027-02-01', criticality: 'regulatory' },
  { key: 'lyra-report', p: 'FR-LYRA', label: 'Ageing report to the customer', dueOn: '2027-03-12', criticality: 'contractual' },
];

export const DEMO_TEST_TYPES: { code: string; name: string; r: string; halfDays: number; skills: string | null }[] = [
  { code: 'FIRING', name: 'Firing test', r: 'PDE-PIL', halfDays: 2, skills: 'Authorised pyrotechnician' },
  { code: 'MACHINING', name: 'Machining of test parts', r: 'PDE-ATM', halfDays: 2, skills: 'Workshop technician' },
  { code: 'FORMULATION', name: 'Formulation trial', r: 'PDE-LAB', halfDays: 2, skills: 'Authorised pyrotechnician' },
  { code: 'TENSILE', name: 'Tensile test', r: 'LAB67-TRAC', halfDays: 1, skills: null },
  { code: 'AGEING', name: 'Climatic ageing cycle', r: 'LAB67-CLIM', halfDays: 6, skills: null },
];

/** Needs of the demo: the PDE forecasts of the week of 14 Dec exceed its capacity (one zone at a time, P-2). */
export const DEMO_NEEDS: { ref: string; p: string; r: string; level: NeedLevel; title: string; halfDays: number; earliestOn: string; deadlineOn: string; milestone?: string; type?: string; on: string; by: string }[] = [
  { ref: 'N-2026-0001', p: 'RD-ORION', r: 'PDE-PIL', level: 'forecast', title: 'Firing campaign before the qualification review', halfDays: 12, earliestOn: '2026-12-07', deadlineOn: '2026-12-18', milestone: 'orion-qual', type: 'FIRING', on: '2026-10-05', by: 'project_lead' },
  { ref: 'N-2026-0002', p: 'RD-VEGA', r: 'PDE-ATM', level: 'forecast', title: 'Machining of the endurance rig', halfDays: 8, earliestOn: '2026-12-14', deadlineOn: '2026-12-18', milestone: 'vega-proto', type: 'MACHINING', on: '2026-10-12', by: 'vega_lead' },
  { ref: 'N-2026-0003', p: 'RD-CASSIOPEE', r: 'PDE-LAB', level: 'forecast', title: 'Formulation trials for the safety file', halfDays: 4, earliestOn: '2026-12-14', deadlineOn: '2026-12-18', milestone: 'cass-safety', type: 'FORMULATION', on: '2026-10-14', by: 'project_lead' },
  { ref: 'N-2026-0004', p: 'RD-ORION', r: 'PDE-PIL', level: 'request', title: 'Firing tests, series 2', halfDays: 2, earliestOn: '2026-10-27', deadlineOn: '2026-10-30', milestone: 'orion-freeze', type: 'FIRING', on: '2026-10-09', by: 'project_lead' },
  { ref: 'N-2026-0005', p: 'FR-LYRA', r: 'LAB67-CLIM', level: 'forecast', title: 'Ageing cycles, phase 2', halfDays: 10, earliestOn: '2027-01-04', deadlineOn: '2027-02-26', milestone: 'lyra-report', type: 'AGEING', on: '2026-10-16', by: 'partner' },
  { ref: 'N-2026-0006', p: 'RD-VEGA', r: 'LAB67-TRAC', level: 'request', title: 'Casing tensile tests (repeat)', halfDays: 1, earliestOn: '2026-11-02', deadlineOn: '2026-11-06', milestone: 'vega-proto', type: 'TENSILE', on: '2026-10-21', by: 'vega_lead' },
];

async function seedResources(tx: Tx, idOf: Map<string, string>): Promise<void> {
  const rows = await tx.insert(resources).values(DEMO_RESOURCES).returning({ id: resources.id, code: resources.code });
  const rid = new Map(rows.map((r) => [r.code, r.id]));
  const byKey = new Map(DEMO_PEOPLE.map((p) => [p.key, p]));
  await tx.insert(facilityHours).values(['LAB67', 'PDE'].flatMap((facilityCode) => [1, 2, 3, 4, 5].map((weekday) => ({ facilityCode, weekday, opensAt: '07:00', closesAt: '17:00' }))));
  await tx.insert(closures).values([
    { facilityCode: null, fromOn: '2026-11-11', toOn: '2026-11-11', label: 'Armistice Day' },
    { facilityCode: null, fromOn: '2026-12-24', toOn: '2027-01-01', label: 'Year-end shutdown' },
  ]);
  const [rule] = await tx.insert(exclusionRules).values({
    code: 'PDE-ONE-ZONE', label: 'PDE: one zone at a time', maxActive: 1, reason: 'safety',
    motive: 'No pyrotechnic co-activity in the PDE building: only one of its zones works at a time (owner’s answer P-2).',
    status: 'validated', proposedByName: 'Antoine Leroy', validatedByName: 'Nathalie Brun', validatedAt: parisInstant('2026-10-20', '09:00'),
  }).returning({ id: exclusionRules.id });
  await tx.insert(exclusionRuleResources).values(['PDE-ATM', 'PDE-LAB', 'PDE-PIL'].map((c) => ({ ruleId: rule.id, resourceId: rid.get(c)! })));
  await tx.insert(entityAgreements).values({ facilityCode: 'LAB67', entityCode: 'EPCFR', quotaDaysPerMonth: 4, noticeWorkdays: 10, note: 'Demonstration agreement', updatedByName: 'Hélène Marchal' });
  await tx.insert(inspections).values([
    { resourceId: rid.get('PDE-PIL')!, label: 'Periodic check of the electrical installations', periodMonths: 12, lastOn: '2025-11-16', updatedByName: 'Damien Petit' },
    { resourceId: rid.get('LAB67-CLIM')!, label: 'Pressure equipment inspection', periodMonths: 24, lastOn: '2025-03-10', updatedByName: 'Sandrine Roux' },
  ]);
  await tx.insert(unavailabilities).values({
    resourceId: rid.get('LAB67-CLIM')!, kind: 'maintenance', label: 'Annual maintenance of the chamber', startsAt: parisInstant('2026-11-03', '00:00'), endsAt: parisInstant('2026-11-05', '00:00'), createdByName: 'Sandrine Roux',
  });
  await tx.insert(testTypes).values(DEMO_TEST_TYPES.map((x) => ({ code: x.code, name: x.name, nominalResourceId: rid.get(x.r)!, typicalHalfDays: x.halfDays, skills: x.skills, updatedByName: 'Antoine Leroy' })));
  const ms = await tx.insert(projectMilestones).values(DEMO_MILESTONES.map((m) => ({ projectCode: m.p, label: m.label, dueOn: m.dueOn, criticality: m.criticality, updatedByName: 'Demonstration data set' })))
    .returning({ id: projectMilestones.id });
  const milestoneId = new Map(DEMO_MILESTONES.map((m, i) => [m.key, ms[i].id]));
  const needRows = await tx.insert(testNeeds).values(DEMO_NEEDS.map((n) => {
    const requester = byKey.get(n.by)!;
    return {
      ref: n.ref, projectCode: n.p, milestoneId: n.milestone ? milestoneId.get(n.milestone)! : null, testTypeCode: n.type ?? null, resourceId: rid.get(n.r)!, level: n.level,
      title: n.title, halfDays: n.halfDays, earliestOn: n.earliestOn, deadlineOn: n.deadlineOn, requestedByUserId: idOf.get(requester.email)!, requestedByName: requester.name,
      requestedAt: parisInstant(n.on, '09:00'),
    };
  })).returning({ id: testNeeds.id, ref: testNeeds.ref });
  const needId = new Map(needRows.map((n) => [n.ref, n.id]));
  const res = new Map(DEMO_RESOURCES.map((r) => [r.code, r]));
  const entityOf = new Map(DEMO_PROJECTS.map((p) => [p.code, p.entityCode]));
  await tx.insert(bookings).values(DEMO_BOOKINGS.map((b, i) => {
    const [fromOn, fromAt, toOn, toAt] = b.slot;
    const requester = byKey.get(b.by)!;
    const confirmed = b.status !== 'requested';
    return {
      ref: `B-2026-${String(i + 1).padStart(4, '0')}`, resourceId: rid.get(b.r)!, projectCode: b.p, entityCode: entityOf.get(b.p)!, title: b.title,
      startsAt: parisInstant(fromOn, fromAt), endsAt: parisInstant(toOn, toAt), setupMinutes: res.get(b.r)!.setupMinutes, teardownMinutes: res.get(b.r)!.teardownMinutes,
      status: b.status, actualStartAt: b.actual ? parisInstant(fromOn, b.actual[0]) : null, actualEndAt: b.actual ? parisInstant(toOn, b.actual[1]) : null,
      requestedByUserId: idOf.get(requester.email)!, requestedByName: requester.name, requestedAt: parisInstant(b.on, '10:00'),
      confirmedByName: confirmed ? 'Antoine Leroy' : null, confirmedAt: confirmed ? parisInstant(b.on, '16:00') : null,
      needId: b.need ? needId.get(b.need)! : null,
    };
  }));
}

export const DEMO_SKILLS = [
  { code: 'PYRO', name: 'Authorised pyrotechnician', cursusTitreId: 'habilitation.PYRO' },
  { code: 'MECA', name: 'Workshop technician', cursusTitreId: null },
  { code: 'LABO', name: 'Laboratory technician', cursusTitreId: null },
] as const;

export const DEMO_OPERATORS: { name: string; matricule: string | null; facilities: string[]; skills: [string, string | null][]; user?: string; absences?: [string, string][] }[] = [
  { name: 'Julien Masson', matricule: 'EP0412', facilities: ['PDE'], skills: [['PYRO', '2027-09-30'], ['MECA', null]], user: 'technician' },
  { name: 'Karim Benali', matricule: 'EP0388', facilities: ['PDE'], skills: [['PYRO', '2027-03-31']], absences: [['2026-11-23', '2026-11-27']] },
  { name: 'Sophie Lambert', matricule: 'EP0521', facilities: ['PDE'], skills: [['MECA', null]] },
  { name: 'Léa Martin', matricule: 'EP0607', facilities: ['LAB67', 'PDE'], skills: [['LABO', null], ['PYRO', '2027-06-30']] },
];

async function seedPlanning(tx: Tx, idOf: Map<string, string>): Promise<void> {
  const { runEngine } = await import('@/server/planning/engine-run');
  const { DEMO_TODAY_ISO } = await import('@/domain/clock');
  const { PRIORITY_CRITERIA } = await import('@/domain/planning-vocabulary');
  const rid = new Map((await tx.select({ id: resources.id, code: resources.code }).from(resources)).map((r) => [r.code, r.id]));
  const byKey = new Map(DEMO_PEOPLE.map((p) => [p.key, p]));
  await tx.insert(skills).values(DEMO_SKILLS.map((x) => ({ ...x })));
  for (const o of DEMO_OPERATORS) {
    const [p] = await tx.insert(people).values({
      name: o.name, entityCode: 'EPC2I', matricule: o.matricule, facilityCodes: o.facilities, updatedByName: 'Demonstration data set',
      userId: o.user ? idOf.get(byKey.get(o.user)!.email)! : null,
    }).returning({ id: people.id });
    await tx.insert(personSkills).values(o.skills.map(([skillCode, validUntil]) => ({ personId: p.id, skillCode, validUntil, updatedByName: 'Demonstration data set' })));
    if (o.absences) await tx.insert(personAbsences).values(o.absences.map(([fromOn, toOn]) => ({ personId: p.id, fromOn, toOn, createdByName: 'Damien Petit' })));
  }
  await tx.insert(mobileEquipment).values([
    { code: 'CAM-01', name: 'High-speed camera', facilityCode: 'PDE', updatedByName: 'Damien Petit' },
    { code: 'ACQ-01', name: 'Acquisition chain', facilityCode: 'PDE', updatedByName: 'Damien Petit' },
  ]);
  await tx.insert(testTypeSkills).values([
    { testTypeCode: 'FIRING', skillCode: 'PYRO', count: 2 },
    { testTypeCode: 'MACHINING', skillCode: 'MECA', count: 1 },
    { testTypeCode: 'FORMULATION', skillCode: 'PYRO', count: 1 },
    { testTypeCode: 'TENSILE', skillCode: 'LABO', count: 1 },
    { testTypeCode: 'AGEING', skillCode: 'LABO', count: 1 },
  ]);
  await tx.insert(testTypeEquipment).values([{ testTypeCode: 'FIRING', equipmentCode: 'CAM-01' }, { testTypeCode: 'FIRING', equipmentCode: 'ACQ-01' }]);
  await tx.insert(substitutions).values([
    {
      testTypeCode: 'FORMULATION', resourceId: rid.get('LAB67-ANA')!, conditions: 'Inert formulations only, under 50 g of material per trial.', codexRef: 'NT-RD-0142',
      technicalReferent: 'Hélène Marchal', hazardous: true, status: 'validated', proposedByName: 'Antoine Leroy',
      hostValidatedByName: 'Sandrine Roux', hostValidatedAt: parisInstant('2026-10-15', '10:00'), safetyValidatedByName: 'Nathalie Brun', safetyValidatedAt: parisInstant('2026-10-16', '11:00'),
    },
    {
      testTypeCode: 'TENSILE', resourceId: rid.get('PDE-ATM')!, conditions: 'Portable tensile rig, samples up to 20 kN.', codexRef: 'NT-RD-0157',
      technicalReferent: 'Hélène Marchal', hazardous: false, status: 'proposed', proposedByName: 'Damien Petit',
    },
  ]);
  await tx.insert(priorityRuleSets).values({ version: 1, criteria: [...PRIORITY_CRITERIA], note: 'Starting order (A-2)', publishedByName: 'Hélène Marchal', publishedAt: parisInstant('2026-10-20', '09:00') });
  // The confirmed firing tests of 27 Oct already have their pyrotechnicians and camera.
  const [b11] = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.ref, 'B-2026-0011'));
  const ops = await tx.select({ id: people.id, name: people.name }).from(people);
  const op = (name: string) => ops.find((x) => x.name === name)!.id;
  await tx.insert(bookingStaff).values([{ bookingId: b11.id, personId: op('Julien Masson'), skillCode: 'PYRO' }, { bookingId: b11.id, personId: op('Karim Benali'), skillCode: 'PYRO' }]);
  await tx.insert(bookingEquipment).values([{ bookingId: b11.id, equipmentCode: 'CAM-01' }, { bookingId: b11.id, equipmentCode: 'ACQ-01' }]);
  await runEngine(tx, { trigger: 'manual', by: { name: 'Antoine Leroy', userId: idOf.get(byKey.get('coordinator')!.email)!, role: 'coordinator' }, today: DEMO_TODAY_ISO, now: parisInstant(DEMO_TODAY_ISO, '08:00') });
  // Delivery 5: the weekly snapshots of the weeks already over (X-4).
  const { computeWeeklySnapshots } = await import('@/server/planning/snapshots');
  await computeWeeklySnapshots(tx, DEMO_TODAY_ISO, 6, parisInstant(DEMO_TODAY_ISO, '07:00'));
}
