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
  const soon = await get('/planning', 'coordinator');
  check(soon.status === 200 && soon.body.includes('Prévu pour la livraison 2'), 'a screen of a later delivery says when it comes');
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
