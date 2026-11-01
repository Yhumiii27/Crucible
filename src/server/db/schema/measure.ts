// Measured occupancy (CR-071, X-8) and calendar subscriptions (CR-072, X-9).
// - A device (kiosk, bench PC agent, interlock, badge reader) is bound to one resource and authenticates with a token that is
//   shown once and kept only as its SHA-256 hash. Its events are append-only (database triggers): what was received, when, and
//   what it did to the booking.
// - A calendar subscription is a secret address that Outlook (and so Teams) reads: the person's tests or one resource, with the
//   person's rights at the time of each read. Kept as a hash too; revoked, never deleted.
import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { crucible } from './_schema';
import { id } from './_common';
import { users } from './organisation';
import { bookings, resources } from './resources';

export const occupancyDevices = crucible.table('occupancy_devices', {
  id: id(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  /** kiosk | agent | interlock | badge. */
  kind: text('kind').notNull(),
  /** As typed, e.g. "Borne entrée pilote". */
  label: text('label').notNull(),
  /** SHA-256 (hex) of the device token; the token itself is never stored. */
  tokenHash: text('token_hash').notNull().unique(),
  createdByName: text('created_by_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedByName: text('revoked_by_name'),
}, (t) => [index('occupancy_devices_resource_idx').on(t.resourceId)]);

export const occupancyEvents = crucible.table('occupancy_events', {
  id: id(),
  deviceId: uuid('device_id').notNull().references(() => occupancyDevices.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  /** start | stop. */
  kind: text('kind').notNull(),
  /** When it happened (sent by the device, or the time of receipt). */
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  /** started | ended | unbooked_start | unbooked_stop | ignored. */
  outcome: text('outcome').notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id),
  /** Why an event was ignored (EN source text). */
  note: text('note'),
}, (t) => [index('occupancy_events_resource_idx').on(t.resourceId, t.occurredAt)]);

export const calendarFeeds = crucible.table('calendar_feeds', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  /** Profile whose rights apply (the active one when the subscription was made). */
  role: text('role').notNull(),
  /** mine | resource. */
  scope: text('scope').notNull(),
  resourceId: uuid('resource_id').references(() => resources.id),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [index('calendar_feeds_user_idx').on(t.userId)]);
