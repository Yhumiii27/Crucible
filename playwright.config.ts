// End-to-end journeys in the browser (CR-080, X-15): Chromium against a running production server of Crucible with the demo
// data set and the business clock pinned to Thu 22 Oct 2026 (CRUCIBLE_CLOCK=2026-10-22), demo sign-in ("View as" cookie).
// CI starts the server and runs them right after the smoke test; locally: build, `npm run db:local`, migrate with
// CRUCIBLE_SEED=demo, start on port 3510, then `npm run test:e2e`. The journeys change the database: run them on a fresh one.
// CRUCIBLE_E2E_URL picks another server; PW_CHROMIUM_PATH another Chromium (a cloud container's pre-installed browser).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.CRUCIBLE_E2E_URL ?? 'http://127.0.0.1:3510',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {} },
  }],
});
