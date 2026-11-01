// Forms of the bookings (CR-075, X-14): one template per facility and stage (safety checklist, test sheet, incident report),
// kept by the facility's managers (a change raises its version); the forms filled for a booking are kept as filled, with a copy
// of the items answered (append-only, database triggers).
import { boolean, index, integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { FormItem, FormStage } from '@/domain/booking-forms';
import { crucible } from './_schema';
import { id, timestamps } from './_common';
import { facilities, users } from './organisation';
import { bookings } from './resources';

export const formTemplates = crucible.table('form_templates', {
  id: id(),
  facilityCode: text('facility_code').notNull().references(() => facilities.code, { onDelete: 'cascade' }),
  stage: text('stage').$type<FormStage>().notNull(),
  items: jsonb('items').$type<FormItem[]>().notNull(),
  version: integer('version').notNull().default(1),
  active: boolean('active').notNull().default(true),
  updatedByName: text('updated_by_name').notNull(),
  ...timestamps,
}, (t) => [unique('form_templates_facility_stage_uq').on(t.facilityCode, t.stage)]);

export const formResponses = crucible.table('form_responses', {
  id: id(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  templateId: uuid('template_id').notNull().references(() => formTemplates.id),
  stage: text('stage').$type<FormStage>().notNull(),
  version: integer('version').notNull(),
  /** The items as they were when the form was filled. */
  items: jsonb('items').$type<FormItem[]>().notNull(),
  answers: jsonb('answers').$type<Record<string, string | boolean>>().notNull(),
  filledByUserId: uuid('filled_by_user_id').references(() => users.id),
  filledByName: text('filled_by_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('form_responses_booking_idx').on(t.bookingId, t.stage)]);
