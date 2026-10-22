import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests run on PostgreSQL (src/test/db.ts: one fresh database per file on CRUCIBLE_TEST_ADMIN_URL's server). DATABASE_URL is a
// placeholder the configuration requires; the tests point getDb() at their own database. CRUCIBLE_AUTH empty: demo mode (the
// Entra tests set it themselves); MATRIX_URL / MATRIX_DECLARATIONS_DIR blank: the tests declare nothing to Matrix.
// CRUCIBLE_CLOCK pinned to the demo data set's date, Thu 22 Oct 2026 (unset is the real clock).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL: 'postgres://crucible_app:unused@127.0.0.1:5432/crucible_unused', CRUCIBLE_AUTH: '', CRUCIBLE_CLOCK: '2026-10-22', CRUCIBLE_SEED: '', MATRIX_URL: '', MATRIX_DECLARATIONS_DIR: '' },
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), 'server-only': path.resolve(__dirname, 'src/test/server-only-stub.ts') } },
});
