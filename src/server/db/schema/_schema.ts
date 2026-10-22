// Crucible's PostgreSQL schema. Every table is declared in it (`crucible.table(…)`, never `pgTable(…)`), so the migrations and the
// queries name `"crucible".` explicitly — on every database: Crucible runs on PostgreSQL only (owner, 22 Oct 2026), in its own
// schema of the shared EPC2I server (M-01), with the same layout on a developer's or the CI's server. Codex's layout.
// This object is deliberately NOT re-exported by ./index.ts: drizzle-kit would then start a migration with CREATE SCHEMA,
// which crucible_app may not run (the schema is created by Matrix's base layer, or by `npm run db:local` on a developer machine).
import { pgSchema } from 'drizzle-orm/pg-core';
import { SERVER_SCHEMA } from '../server-schema';

export const crucible = pgSchema(SERVER_SCHEMA);
