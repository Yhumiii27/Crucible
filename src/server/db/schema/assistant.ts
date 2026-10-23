// The AI assistant's exchanges (docs/spec/04, decisions I-1 to I-4; delivery 6). The assistant writes nothing in the planning:
// it reads what the person may see, explains, simulates and prepares; the person validates in the usual screen, and that write's
// audit row cites the exchange (spec 04 §3, traceability). Conversations and turns are append-only (database triggers): what was
// asked, what was looked up, what was sent to the provider and what was answered stay as they were.
import { index, jsonb, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { crucible } from './_schema';
import { id } from './_common';
import { users } from './organisation';

export const assistantConversations = crucible.table('assistant_conversations', {
  id: id(),
  /** "AS-2026-0001". */
  ref: text('ref').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id),
  userName: text('user_name').notNull(),
  /** Active role when the conversation started. */
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('assistant_conversations_user_idx').on(t.userId, t.createdAt)]);

export const assistantTurns = crucible.table('assistant_turns', {
  id: id(),
  conversationId: uuid('conversation_id').notNull().references(() => assistantConversations.id),
  /** 1, 2, 3… in the conversation. */
  seq: smallint('seq').notNull(),
  /** Active role of the person for this turn (the lookups use its rights). */
  role: text('role').notNull(),
  /** The question as typed. */
  question: text('question').notNull(),
  /** `local` (rule-based templates, nothing leaves Crucible) or `claude`. */
  provider: text('provider').notNull(),
  /** The model that answered (after a server-side refusal fallback, the fallback model). */
  model: text('model'),
  /** What is shown: text from the model, or the parts of a templated answer. */
  answer: jsonb('answer').$type<Record<string, unknown>[]>().notNull(),
  /** Claude: the messages this turn added to the conversation, verbatim (the next turns resend them unchanged). */
  apiMessages: jsonb('api_messages').$type<Record<string, unknown>[]>(),
  /** The lookups made, with their input: with Claude, what was sent to the provider. */
  lookups: jsonb('lookups').$type<Record<string, unknown>[]>().notNull().default([]),
  /** A need prepared for the person to validate in the needs form. */
  draft: jsonb('draft').$type<Record<string, unknown>>(),
  /** Why Claude did not answer and the templates did (EN source). */
  notice: text('notice'),
  usage: jsonb('usage').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('assistant_turns_seq_uq').on(t.conversationId, t.seq)]);
