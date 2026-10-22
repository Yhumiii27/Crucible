import 'server-only';
// Facility and project reads under the visibility rules (docs/spec/01 §2, U-3): every read filters in SQL with the viewer's
// visibility (src/domain/rights.ts); an object outside it does not exist for the viewer (null, never "forbidden").
import { and, asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { facilityVisibility, projectVisibility, type FacilityVisibility, type ProjectVisibility } from '@/domain/rights';
import type { PriorityClass } from '@/domain/organisation';
import { getDb } from '@/server/db/client';
import { entities, facilities, facilityPartners, projects, sites } from '@/server/db/schema';
import type { Viewer } from '@/server/viewer';

/** SQL condition of a facility visibility (null = no restriction). */
export function facilityCondition(v: FacilityVisibility): SQL | null {
  switch (v.kind) {
    case 'all':
      return null;
    case 'none':
      return sql`false`;
    case 'entities':
      if (!v.entities.length) return sql`false`;
      return or(
        inArray(facilities.operatorEntityCode, v.entities),
        sql`exists (select 1 from ${facilityPartners} where ${facilityPartners.facilityCode} = ${facilities.code} and ${inArray(facilityPartners.entityCode, v.entities)})`,
      )!;
  }
}

/** SQL condition of a project visibility (null = no restriction). */
export function projectCondition(v: ProjectVisibility): SQL | null {
  switch (v.kind) {
    case 'all':
      return null;
    case 'none':
      return sql`false`;
    case 'open':
      return eq(projects.confidential, false);
    case 'scoped': {
      const parts: SQL[] = [];
      if (v.projects.length) parts.push(inArray(projects.code, v.projects));
      if (v.entities.length) parts.push(and(eq(projects.confidential, false), inArray(projects.entityCode, v.entities))!);
      return parts.length ? or(...parts)! : sql`false`;
    }
  }
}

export interface FacilityRow {
  code: string;
  name: string;
  description: string | null;
  siteCode: string;
  siteName: string;
  operatorEntityCode: string;
  operatorName: string;
  partnerEntityCodes: string[];
}

async function selectFacilities(viewer: Viewer, extra?: SQL): Promise<FacilityRow[]> {
  const db = await getDb();
  const where = [facilityCondition(facilityVisibility(viewer.role, viewer.assignments)), eq(facilities.active, true), extra].filter((c): c is SQL => !!c);
  const rows = await db
    .select({
      code: facilities.code, name: facilities.name, description: facilities.description, siteCode: facilities.siteCode, siteName: sites.name,
      operatorEntityCode: facilities.operatorEntityCode, operatorName: entities.name,
    })
    .from(facilities)
    .innerJoin(sites, eq(sites.code, facilities.siteCode))
    .innerJoin(entities, eq(entities.code, facilities.operatorEntityCode))
    .where(and(...where))
    .orderBy(asc(facilities.code));
  if (!rows.length) return [];
  const partners = await db.select().from(facilityPartners).where(inArray(facilityPartners.facilityCode, rows.map((r) => r.code)));
  return rows.map((r) => ({ ...r, partnerEntityCodes: partners.filter((p) => p.facilityCode === r.code).map((p) => p.entityCode).sort() }));
}

/** The facilities the viewer sees. */
export function visibleFacilities(viewer: Viewer): Promise<FacilityRow[]> {
  return selectFacilities(viewer);
}

/** One facility, or null when it does not exist or is outside the viewer's visibility. */
export async function facilityForViewer(viewer: Viewer, code: string): Promise<FacilityRow | null> {
  return (await selectFacilities(viewer, eq(facilities.code, code)))[0] ?? null;
}

export interface ProjectRow {
  code: string;
  name: string;
  entityCode: string;
  entityName: string;
  priorityClass: PriorityClass;
  confidential: boolean;
  keystoneCode: string | null;
  codexProgramCode: string | null;
}

async function selectProjects(viewer: Viewer, extra?: SQL): Promise<ProjectRow[]> {
  const db = await getDb();
  const where = [projectCondition(projectVisibility(viewer.role, viewer.assignments)), eq(projects.active, true), extra].filter((c): c is SQL => !!c);
  return db
    .select({
      code: projects.code, name: projects.name, entityCode: projects.entityCode, entityName: entities.name, priorityClass: projects.priorityClass,
      confidential: projects.confidential, keystoneCode: projects.keystoneCode, codexProgramCode: projects.codexProgramCode,
    })
    .from(projects)
    .innerJoin(entities, eq(entities.code, projects.entityCode))
    .where(and(...where))
    .orderBy(asc(projects.code));
}

/** The projects the viewer sees in full. */
export function visibleProjects(viewer: Viewer): Promise<ProjectRow[]> {
  return selectProjects(viewer);
}

/** One project, or null when it does not exist or is outside the viewer's visibility. */
export async function projectForViewer(viewer: Viewer, code: string): Promise<ProjectRow | null> {
  return (await selectProjects(viewer, eq(projects.code, code)))[0] ?? null;
}
