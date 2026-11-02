// REST API and webhooks for the bench systems (CR-083, X-17).
// - An API client is a bench system (test bench supervision, LIMS, acquisition PC) of one facility, declared by a facility
//   manager. It reads the facility's resources, bookings and events with a token shown once and kept only as its SHA-256 hash
//   (prefix `cra_`); revoked, never deleted. It writes nothing in Crucible.
// - Its webhook (optional) receives each event of the facility, signed with HMAC-SHA256. The signing secret must be read back to
//   sign, so it is stored (never shown again after its creation); a new secret replaces it.
// - Events are written by database triggers on the bookings and the incidents (drizzle/0022), in the transaction of the change,
//   so no write path can forget one; append-only. `seq` orders them: Crucible's writes run one at a time (write lock), so a
//   later sequence number is always committed later, and a client's cursor never skips an event.
import { bigint, bigserial, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { crucible } from './_schema';
import { id } from './_common';
import { facilities } from './organisation';
import { incidents } from './incidents';
import { bookings, resources } from './resources';

export const apiClients = crucible.table('api_clients', {
  id: id(),
  facilityCode: text('facility_code').notNull().references(() => facilities.code),
  /** As typed, e.g. "Supervision banc B2". */
  label: text('label').notNull(),
  /** SHA-256 (hex) of the token; the token itself is never stored. */
  tokenHash: text('token_hash').notNull().unique(),
  /** Address the events are posted to; null = the client reads /api/v1/events itself. */
  webhookUrl: text('webhook_url'),
  /** HMAC-SHA256 key of the signatures (`crw_…`), read back to sign; never shown after its creation. */
  webhookSecret: text('webhook_secret'),
  /** Last event delivered to the webhook (`api_events.seq`); set to the last event at creation (no backlog). */
  cursor: bigint('cursor', { mode: 'number' }).notNull().default(0),
  /** Failed attempts in a row; reset by a delivery. */
  failures: integer('failures').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
  /** Why the last attempt failed (HTTP status or network error), null after a delivery. */
  lastError: text('last_error'),
  createdByName: text('created_by_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedByName: text('revoked_by_name'),
}, (t) => [index('api_clients_facility_idx').on(t.facilityCode)]);

export const apiEvents = crucible.table('api_events', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  /** booking.<status> | booking.moved | incident.<status>. */
  kind: text('kind').notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id),
  incidentId: uuid('incident_id').references(() => incidents.id),
  /** The resource it concerns (for a booking moved to another resource: one event for each). */
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('api_events_resource_idx').on(t.resourceId, t.seq)]);
