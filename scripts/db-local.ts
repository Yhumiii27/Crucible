// npm run db:local — creates Crucible's database on a developer's PostgreSQL server: database `epc2i` (CRUCIBLE_LOCAL_DATABASE),
// role crucible_app (password CRUCIBLE_LOCAL_PASSWORD, default "crucible-dev") and schema `crucible`, the layout of the shared EPC2I
// server (Matrix). Connects with CRUCIBLE_ADMIN_URL (a superuser; default postgres://postgres:postgres@127.0.0.1:5432/postgres)
// and prints the DATABASE_URL to put in .env.local. Then: npm run db:migrate. Never run it against the shared server: there,
// Matrix's base layer creates the role and the schema.
import pg from 'pg';
import { loadEnvFiles } from '@/server/config/env-files';
import { appUrlOf, provisionDatabase, provisionSchema, withDatabase } from '@/server/db/provision';

async function main(): Promise<void> {
  loadEnvFiles(process.cwd());
  const adminUrl = process.env.CRUCIBLE_ADMIN_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
  const database = process.env.CRUCIBLE_LOCAL_DATABASE || 'epc2i';
  const password = process.env.CRUCIBLE_LOCAL_PASSWORD || 'crucible-dev';
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await provisionDatabase(admin, { database, password });
  } finally {
    await admin.end();
  }
  const inDb = new pg.Client({ connectionString: withDatabase(adminUrl, database) });
  await inDb.connect();
  try {
    await provisionSchema(inDb);
  } finally {
    await inDb.end();
  }
  console.log(`Database "${database}" ready (role crucible_app, schema crucible).\nDATABASE_URL=${appUrlOf(adminUrl, database, password)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
