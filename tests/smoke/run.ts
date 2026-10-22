// Smoke test of a running Crucible (production build, demo data set): health, the pages of each profile, the visibility rules
// over HTTP (U-3: a partner sees laboratoire 67 only, a confidential project stays in its team), the security headers and the
// French rendering.
//   CRUCIBLE_SMOKE_URL=http://127.0.0.1:3510 npx tsx tests/smoke/run.ts
const BASE = (process.env.CRUCIBLE_SMOKE_URL || 'http://127.0.0.1:3510').replace(/\/+$/, '');

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
}

async function get(path: string, role?: string): Promise<{ status: number; body: string; headers: Headers }> {
  const r = await fetch(BASE + path, { headers: role ? { cookie: `crucible-role=${role}` } : {}, redirect: 'manual' });
  return { status: r.status, body: await r.text(), headers: r.headers };
}

const facilityCodes = (html: string) => [...new Set(html.match(/\b(LAB67|PDE)\b(?=<)/g) ?? [])].sort();
const projectCodes = (html: string) => [...new Set(html.match(/\b(RD|FR)-[A-Z]+\b/g) ?? [])].sort();

async function main(): Promise<void> {
  const health = await get('/api/health');
  check(health.status === 200 && JSON.parse(health.body).status === 'ok', 'GET /api/health → 200 ok');

  const home = await get('/', 'rd_director');
  check(home.status === 200 && home.body.includes('Bonjour Hélène'), 'Home in French for the R&D director');
  check(!!home.headers.get('content-security-policy')?.includes("'nonce-"), 'per-request Content-Security-Policy with a nonce');
  check(home.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options: DENY');

  const facilities: Record<string, string[]> = { rd_director: ['LAB67', 'PDE'], technician: ['LAB67', 'PDE'], partner: ['LAB67'] };
  for (const [role, want] of Object.entries(facilities)) {
    const r = await get('/facilities', role);
    check(r.status === 200 && JSON.stringify(facilityCodes(r.body)) === JSON.stringify(want), `facilities of ${role}: ${want.join(', ')}`);
  }
  const projects: Record<string, string[]> = {
    rd_director: ['FR-LYRA', 'RD-CASSIOPEE', 'RD-ORION', 'RD-VEGA'],
    coordinator: ['FR-LYRA', 'RD-ORION', 'RD-VEGA'],
    project_lead: ['RD-CASSIOPEE', 'RD-ORION'],
    partner: ['FR-LYRA'],
  };
  for (const [role, want] of Object.entries(projects)) {
    const r = await get('/projects', role);
    check(r.status === 200 && JSON.stringify(projectCodes(r.body)) === JSON.stringify(want), `projects of ${role}: ${want.join(', ')}`);
  }
  check((await get('/projects', 'technician')).status === 404, 'the project register is not in a technician’s workspace (404)');
  check((await get('/admin/users', 'rd_director')).status === 404, 'user administration refused to the R&D director (404)');
  check((await get('/admin/users', 'admin')).status === 200, 'user administration open to the administrator');
  const org = await get('/admin/organisation', 'rd_director');
  check(org.status === 200 && org.body.includes('Classe de priorité'), 'the R&D director records projects and their priority class');
  check((await get('/facilities', 'admin')).status === 404, 'the administrator sees no business screen');
  const soon = await get('/propose', 'coordinator');
  check(soon.status === 200 && soon.body.includes('Prévu pour la livraison 4'), 'a screen of a later delivery says when it comes');

  // Delivery 2: resources, rules, bookings, utilisation.
  const plan = await get('/planning?week=2026-10-26', 'coordinator');
  check(plan.status === 200 && plan.body.includes('PDE-ONE-ZONE · PDE-PIL') && plan.body.includes('B-2026-0011'), 'planning: the PDE zones blocked by the pilot (P-2), the bookings of the week');
  const partnerPlan = await get('/planning?week=2026-10-26', 'partner');
  check(partnerPlan.status === 200 && partnerPlan.body.includes('Réservé · EPC2I') && !partnerPlan.body.includes('RD-ORION') && !partnerPlan.body.includes('PDE-PIL'), 'planning of EPC France: laboratoire 67 only, other entities’ tests masked (U-3)');
  check((await get('/facilities/LAB67', 'partner')).status === 200 && (await get('/facilities/PDE', 'partner')).status === 404, 'facility sheet: laboratoire 67 for the partner, the PDE does not exist for it');
  const sheet = await get('/facilities/PDE', 'facility_manager');
  check(sheet.status === 200 && sheet.body.includes('Vérification périodique des installations électriques'), 'facility sheet of the PDE: zones, rule, inspections');
  const rules = await get('/rules', 'safety');
  check(rules.status === 200 && rules.body.includes('PDE-ONE-ZONE') && rules.body.includes('Validée'), 'rules: the validated PDE rule for the safety officer');
  check((await get('/rules', 'partner')).status === 404, 'rules are not in the partner’s workspace');
  const dash = await get('/dashboard?from=2026-09-28&to=2026-10-22', 'rd_director');
  check(dash.status === 200 && dash.body.includes('Occupation par moyen') && dash.body.includes('Bloqué par une règle'), 'utilisation dashboard: rates per resource, blocked by a rule');
  const mine = await get('/my/schedule', 'technician');
  check(mine.status === 200 && mine.body.includes('B-2026-0010'), 'my schedule: today’s test of the PDE for its technician');
  // Delivery 3: milestones, needs, load forecast, connectors.
  const load = await get('/load', 'coordinator');
  check(load.status === 200 && load.body.includes('Goulots') && load.body.includes('PDE-ONE-ZONE') && load.body.includes('PDE-ONE-ZONE · Semaine du 14/12/2026 · dans 8 semaines'), 'load forecast: the PDE bottleneck 8 weeks ahead');
  check((await get('/load', 'project_lead')).status === 404, 'the load forecast is not in a project lead’s workspace');
  const needs = await get('/my/needs', 'project_lead');
  check(needs.status === 200 && needs.body.includes('N-2026-0001') && needs.body.includes('RD-CASSIOPEE'), 'my test needs: the needs of the project lead’s projects');
  const lyra = await get('/my/needs', 'partner');
  check(lyra.status === 200 && lyra.body.includes('N-2026-0005') && !lyra.body.includes('N-2026-0001'), 'my test needs of EPC France: its projects only');
  const orion = await get('/projects/RD-ORION', 'rd_director');
  check(orion.status === 200 && orion.body.includes('Revue de qualification') && orion.body.includes('N-2026-0004'), 'project sheet: milestones and needs');
  check((await get('/projects/RD-ORION', 'partner')).status === 404 && (await get('/projects/RD-CASSIOPEE', 'coordinator')).status === 404, 'project sheet: outside the visibility, the project does not exist (U-3)');
  const conn = await get('/admin/connectors', 'admin');
  check(conn.status === 200 && conn.body.includes('crucible.pub_reservations') && conn.body.includes('Pas encore publiée'), 'connectors: published views and the views not published yet');
  check((await get('/propose', 'partner')).status === 404, 'a screen outside the profile’s workspace is not found');
  check((await get('/nowhere', 'rd_director')).status === 404, 'an unknown path is not found');

  if (failures) {
    console.error(`${failures} smoke check(s) failed`);
    process.exit(1);
  }
  console.log('All smoke checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
