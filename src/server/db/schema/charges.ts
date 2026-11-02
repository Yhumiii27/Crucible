// Internal chargeback (CR-074, X-19): dated rates per resource, for every entity (entity null) or one. A rate is never changed:
// a newer one (later first day) takes over; a rate entered by mistake is withdrawn (kept, with who and when). Amounts in cents.
import { date, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { crucible } from './_schema';
import { id } from './_common';
import { entities } from './organisation';
import { resources } from './resources';

export const chargeRates = crucible.table('charge_rates', {
  id: id(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  entityCode: text('entity_code').references(() => entities.code),
  centsPerHour: integer('cents_per_hour').notNull(),
  validFrom: date('valid_from', { mode: 'string' }).notNull(),
  createdByName: text('created_by_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  withdrawnByName: text('withdrawn_by_name'),
}, (t) => [index('charge_rates_resource_idx').on(t.resourceId, t.validFrom)]);
