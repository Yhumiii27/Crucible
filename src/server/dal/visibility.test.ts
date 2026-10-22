// Visibility in the data layer (docs/spec/01 §2, U-3): every demo persona, through the SQL filters, sees exactly the
// facilities and projects the pure rules allow — and an object outside its visibility does not exist for it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLE_KEYS } from '@/config/roles';
import { DEMO_TODAY_ISO } from '@/domain/clock';
import { canSeeFacility, canSeeProject, facilityVisibility, projectVisibility } from '@/domain/rights';
import { DEMO_PEOPLE } from '@/server/db/seed/demo';
import { testDatabase, type TestDatabase } from '@/test/db';
import { accountByEmail, viewerOfAccount } from './users';
import { facilityForViewer, projectForViewer, visibleFacilities, visibleProjects } from './visibility';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase();
});
afterAll(() => t.close());

const viewerOf = async (key: string) => {
  const p = DEMO_PEOPLE.find((x) => x.key === key)!;
  const a = (await accountByEmail(p.email, DEMO_TODAY_ISO))!;
  return viewerOfAccount(a, a.roles[0], true);
};

describe('visibility in SQL', () => {
  it('every profile sees the facilities and projects the rules allow, nothing more', async () => {
    const director = await viewerOf('rd_director');
    const allFacilities = await visibleFacilities(director);
    const allProjects = await visibleProjects(director);
    expect(allFacilities.map((f) => f.code)).toEqual(['LAB67', 'PDE']);
    expect(allProjects.map((p) => p.code)).toEqual(['FR-LYRA', 'RD-CASSIOPEE', 'RD-ORION', 'RD-VEGA']);
    for (const role of ROLE_KEYS) {
      const v = await viewerOf(role);
      const fv = facilityVisibility(v.role, v.assignments);
      const pv = projectVisibility(v.role, v.assignments);
      expect((await visibleFacilities(v)).map((f) => f.code), role).toEqual(allFacilities.filter((f) => canSeeFacility(fv, f)).map((f) => f.code));
      expect((await visibleProjects(v)).map((p) => p.code), role).toEqual(allProjects.filter((p) => canSeeProject(pv, p)).map((p) => p.code));
    }
  });

  it('an EPC France partner sees laboratoire 67 and its own project only: the rest does not exist for it (U-3)', async () => {
    const partner = await viewerOf('partner');
    expect((await visibleFacilities(partner)).map((f) => f.code)).toEqual(['LAB67']);
    expect(await facilityForViewer(partner, 'PDE')).toBeNull();
    expect((await visibleProjects(partner)).map((p) => p.code)).toEqual(['FR-LYRA']);
    expect(await projectForViewer(partner, 'RD-ORION')).toBeNull();
  });

  it('a confidential project is seen by its team and the R&D director only', async () => {
    expect(await projectForViewer(await viewerOf('coordinator'), 'RD-CASSIOPEE')).toBeNull();
    expect(await projectForViewer(await viewerOf('safety'), 'RD-CASSIOPEE')).toBeNull();
    expect((await projectForViewer(await viewerOf('project_lead'), 'RD-CASSIOPEE'))?.confidential).toBe(true);
    expect((await visibleProjects(await viewerOf('vega_lead'))).map((p) => p.code)).toEqual(['RD-VEGA']);
  });

  it('the administrator sees no business data', async () => {
    const admin = await viewerOf('admin');
    expect(await visibleFacilities(admin)).toEqual([]);
    expect(await visibleProjects(admin)).toEqual([]);
  });
});
