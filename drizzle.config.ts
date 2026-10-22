import { defineConfig } from 'drizzle-kit';

// Crucible's tables live in the schema `crucible` (src/server/db/schema/_schema.ts); the journal is crucible.__drizzle_migrations.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  schemaFilter: ['crucible'],
  migrations: { schema: 'crucible', table: '__drizzle_migrations' },
});
