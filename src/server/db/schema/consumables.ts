// Consumables and stock of the tests (CR-076, X-20): consumables per facility, their lots (reference, expiry), the moves of the
// stock (receipt, use by a test, count adjustment, discard — append-only, database triggers) and the quantities a test type
// needs per test.
import { boolean, date, doublePrecision, index, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { MoveKind } from '@/domain/consumables';
import { crucible } from './_schema';
import { id, timestamps } from './_common';
import { testTypes } from './needs';
import { facilities } from './organisation';
import { bookings } from './resources';

export const consumables = crucible.table('consumables', {
  id: id(),
  facilityCode: text('facility_code').notNull().references(() => facilities.code),
  /** As typed. */
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  /** Alert at or under this stock; null = none. */
  threshold: doublePrecision('threshold'),
  active: boolean('active').notNull().default(true),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
}, (t) => [index('consumables_facility_idx').on(t.facilityCode)]);

export const consumableLots = crucible.table('consumable_lots', {
  id: id(),
  consumableId: uuid('consumable_id').notNull().references(() => consumables.id),
  lotRef: text('lot_ref').notNull(),
  expiresOn: date('expires_on', { mode: 'string' }),
  receivedByName: text('received_by_name').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('consumable_lots_consumable_idx').on(t.consumableId)]);

export const consumableMoves = crucible.table('consumable_moves', {
  id: id(),
  consumableId: uuid('consumable_id').notNull().references(() => consumables.id),
  lotId: uuid('lot_id').references(() => consumableLots.id),
  kind: text('kind').$type<MoveKind>().notNull(),
  /** Signed: positive in, negative out. */
  quantity: doublePrecision('quantity').notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id),
  /** Why (adjustment, discard), as typed. */
  reason: text('reason'),
  byName: text('by_name').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('consumable_moves_consumable_idx').on(t.consumableId), index('consumable_moves_booking_idx').on(t.bookingId)]);

export const testTypeConsumables = crucible.table('test_type_consumables', {
  testTypeCode: text('test_type_code').notNull().references(() => testTypes.code),
  consumableId: uuid('consumable_id').notNull().references(() => consumables.id),
  /** Per test. */
  quantity: doublePrecision('quantity').notNull(),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
}, (t) => [primaryKey({ name: 'test_type_consumables_pk', columns: [t.testTypeCode, t.consumableId] })]);
