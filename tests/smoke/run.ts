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
  check(home.status === 200 && home.body.includes('Bonjour, Hélène'), 'Home in French for the R&D director');
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
  // Delivery 4: people, engine, conflicts, substitutions, priority rules.
  const propose = await get('/propose', 'coordinator');
  check(propose.status === 200 && propose.body.includes('R-2026-0001') && propose.body.includes('Lancer le moteur') && propose.body.includes('Un contrôle réglementaire arrive à échéance'), 'proposals: the demo run, its proposals and the need blocked by the inspection');
  const conflictsPage = await get('/conflicts', 'coordinator');
  check(conflictsPage.status === 200 && conflictsPage.body.includes('C-2026-0001') && conflictsPage.body.includes('Recommandée') && conflictsPage.body.includes('Essai de sécurité ou réglementaire'), 'conflicts: the PDE sheet, its recommendation and the rule cited');
  check((await get('/conflicts', 'project_lead')).status === 404, 'conflicts are not in a project lead’s workspace');
  const peoplePage = await get('/people', 'facility_manager');
  check(peoplePage.status === 200 && peoplePage.body.includes('Karim Benali') && peoplePage.body.includes('PYRO'), 'people and skills of the PDE');
  const rulesPage = await get('/rules', 'rd_director');
  check(rulesPage.status === 200 && rulesPage.body.includes('NT-RD-0142') && rulesPage.body.includes('Règles de priorité'), 'rules: the validated substitution and the priority rules');
  // Delivery 5: incidents and scenarios, notifications, steering complements.
  const inc = await get('/incidents', 'coordinator');
  check(inc.status === 200 && inc.body.includes('Déclarer un aléa') && inc.body.includes('Simuler « et si ? »') && inc.body.includes('Déclarer une urgence'), 'incidents: declare, what-if and urgency for the coordinator');
  const techInc = await get('/incidents', 'technician');
  check(techInc.status === 200 && techInc.body.includes('Déclarer un aléa') && !techInc.body.includes('Déclarer une urgence'), 'incidents: the technician declares, never an urgency');
  const bellPage = await get('/notifications', 'coordinator');
  check(bellPage.status === 200 && bellPage.body.includes('Aucune notification.'), 'notifications: the coordinator’s bell (the demo run was the coordinator’s own: nothing to notify)');
  check((await get('/notifications', 'admin')).status === 404, 'the administrator has no bell');
  const steer = await get('/dashboard?from=2026-09-28&to=2026-10-22', 'rd_director');
  check(steer.status === 200 && steer.body.includes('Tendance hebdomadaire') && steer.body.includes('Valeur de la capacité inoccupée') && steer.body.includes('Retards imputables aux moyens'), 'dashboard: weekly trend, value of the unused capacity, delays due to the resources');
  // Delivery 5b: Keystone's shell — page search, header tools, "To decide", facility tabs, CSV export.
  const shell = await get('/load', 'coordinator');
  check(shell.status === 200 && shell.body.includes('Aller à une page…') && shell.body.includes('Date d’état') && shell.body.includes('Planning et charge'), 'shell: page search, status date, menu themes');
  const decide = await get('/my/decisions', 'coordinator');
  check(decide.status === 200 && decide.body.includes('C-2026-0001') && decide.body.includes('R-2026-0001') && decide.body.includes('Arbitrer'), 'to decide: the conflict and the proposals of the coordinator');
  check((await get('/my/decisions', 'project_lead')).status === 404, '"To decide" is not in a project lead’s workspace');
  const tab = await get('/facilities/PDE?tab=inspections', 'facility_manager');
  check(tab.status === 200 && tab.body.includes('Vérification périodique des installations électriques') && tab.body.includes('Prochaine étape'), 'facility sheet: inspections tab and next step');
  check((await get('/load?from=8', 'coordinator')).status === 200 && (await get('/load?view=quarters', 'coordinator')).body.includes('Enveloppes par trimestre'), 'load forecast: window navigation and quarters');
  const csv = await get('/api/export/propose', 'coordinator');
  check(csv.status === 200 && (csv.headers.get('content-type') ?? '').startsWith('text/csv') && csv.body.includes('N-2026-0006'), 'export: CSV of the proposals');
  check((await get('/api/export/propose', 'partner')).status === 404, 'export: refused outside the workspace');
  // Delivery 6: the assistant — its button on every screen, the "Why?" and "Explain" shortcuts, drafts that do not belong to the
  // viewer are ignored (the forms open empty).
  const why = await get('/propose', 'coordinator');
  check(why.status === 200 && why.body.includes('Assistant IA') && why.body.includes('Pourquoi ?'), 'assistant: the header button and the "Why?" of the proposals');
  const explain = await get('/conflicts?ref=C-2026-0001&turn=00000000-0000-0000-0000-000000000000', 'coordinator');
  check(explain.status === 200 && explain.body.includes('Expliquer') && !explain.body.includes('Rédigé par l’assistant'), 'assistant: "Explain" on a conflict; an unknown exchange prefills nothing');
  check((await get('/my/needs?draft=not-a-uuid', 'project_lead')).status === 200, 'assistant: a bad draft reference opens the needs page as usual');
  check(!(await get('/admin/users', 'admin')).body.includes('Assistant IA'), 'assistant: no assistant for the administrator');
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
