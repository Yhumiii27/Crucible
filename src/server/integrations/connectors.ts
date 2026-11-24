import 'server-only';
// Reading the other tools' pub_ views into Crucible (CR-060, S-2, CU-1, V-1; M-17: reads through pub_ views only). Each view is
// read only once it exists and is granted to crucible_app (a view not published or not granted yet is a state, not an error):
// until then — and for whatever a view does not carry — Crucible works from what is entered in it. What is read is written in
// Crucible's own tables with its source, so the rules, the engine and the screens read one place; a row read from another tool
// is changed in that tool, never in Crucible (the Server Functions refuse it).
//   keystone.pub_jalons   → project_milestones (source keystone), for the projects linked to a Keystone project; a milestone
//                           is dated by the end of its linked activity (the months since the project start cannot be dated:
//                           pub_projets carries no start date) — an undated one is skipped;
//   cursus.pub_absences   → person_absences (source cursus) of the people with a matricule; validated and requested absences
//                           (a planner does not plan on a pending leave), cancelled ones left out;
//   vigie.pub_controles   → inspections (source vigie) of the resources whose code is the control's equipment code (D23:
//                           Vigie is the reference for periodic inspections); an archived control no longer applies;
//   keystone.pub_projets  → the projects linked to a Keystone project (S-1, K-3): their name follows Keystone, a project closed
//                           there is flagged (keystone_closed) — setting it aside stays a person's decision (its bookings);
//                           the R&D projects of Keystone not yet in Crucible are offered on the organisation screen;
//   cursus.pub_salaries   → the people with a matricule (S-3): their name follows Cursus, a person who has left is set aside
//                           (never put back by the read: a planner does it);
//   matrix.pub_sites      → the sites linked to a Matrix site (matrix_code, D14, M-6): name, city and country follow Matrix;
//   matrix.pub_filiales   → the entities linked to a Matrix subsidiary (matrix_code, D21): their name follows Matrix; the sites
//                           and subsidiaries of Matrix not yet in Crucible are offered on the organisation screen;
//   vigie.pub_suspensions_essais → unavailabilities "works" (source vigie) of the resources each Vigie zone holds (V-2, M-21,
//                           vigie_zone_resources kept by the facility managers); the bookings they cover are flagged, never moved.
// Run hourly by the job worker (`connectors-read`) and on demand from the Connectors screen; one transaction, audited.
import type { Tx } from '@/server/db/types';
import { readCursusAbsences, readCursusPeople } from '@/server/integrations/cursus/read';
import { readKeystoneMilestones, readKeystoneProjects } from '@/server/integrations/keystone/read';
import { readMatrixEntities, readMatrixSites } from '@/server/integrations/matrix/referentials';
import { readVigieInspections, readVigieSuspensions } from '@/server/integrations/vigie/read';
import type { ReadBy, ReadReport } from '@/server/integrations/views';

/** Reads every view Crucible copies from (in one transaction). */
export async function readConnectors(tx: Tx, by: ReadBy): Promise<ReadReport[]> {
  // People and projects first: the absences and milestones read next are those of the people and projects still in use.
  return [await readKeystoneProjects(tx, by), await readKeystoneMilestones(tx, by), await readCursusPeople(tx, by), await readCursusAbsences(tx, by), await readVigieInspections(tx, by),
    await readMatrixSites(tx, by), await readMatrixEntities(tx, by), await readVigieSuspensions(tx, by)];
}
