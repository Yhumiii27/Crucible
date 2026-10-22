import 'server-only';
// Administration reads (docs/spec/05): organisation reference data (entities, sites, facilities and their partners,
// projects) and user accounts with their role assignments. The pages check the screen access first.
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { entities, facilities, facilityPartners, projects, roleAssignments, sites, users } from '@/server/db/schema';

export async function organisation() {
  const db = await getDb();
  const [e, s, f, fp, p] = await Promise.all([
    db.select().from(entities).orderBy(asc(entities.code)),
    db.select().from(sites).orderBy(asc(sites.code)),
    db.select().from(facilities).orderBy(asc(facilities.code)),
    db.select().from(facilityPartners),
    db.select().from(projects).orderBy(asc(projects.code)),
  ]);
  return {
    entities: e,
    sites: s,
    facilities: f.map((x) => ({ ...x, partnerEntityCodes: fp.filter((y) => y.facilityCode === x.code).map((y) => y.entityCode).sort() })),
    projects: p,
  };
}

export async function usersWithAssignments() {
  const db = await getDb();
  const [u, a] = await Promise.all([
    db.select().from(users).orderBy(asc(users.displayName)),
    db.select({ id: roleAssignments.id, userId: roleAssignments.userId, role: roleAssignments.role, scopeKind: roleAssignments.scopeKind, scopeRef: roleAssignments.scopeRef })
      .from(roleAssignments).innerJoin(users, eq(users.id, roleAssignments.userId)).orderBy(asc(roleAssignments.role)),
  ]);
  return u.map((x) => ({ ...x, assignments: a.filter((y) => y.userId === x.id) }));
}

/** The lists the role and organisation forms choose from. */
export async function referenceLists() {
  const db = await getDb();
  const [e, f, p] = await Promise.all([
    db.select({ code: entities.code, name: entities.name }).from(entities).orderBy(asc(entities.code)),
    db.select({ code: facilities.code, name: facilities.name }).from(facilities).orderBy(asc(facilities.code)),
    db.select({ code: projects.code, name: projects.name }).from(projects).orderBy(asc(projects.code)),
  ]);
  return { entities: e, facilities: f, projects: p };
}
