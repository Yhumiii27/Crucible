import 'server-only';
// One question to the assistant (spec 04; delivery 6): read the conversation, answer with Claude when it is configured (I-3)
// and otherwise — or when Claude fails — with the templates, then record the turn. The provider is called outside any
// transaction; the turn is written in one transaction that refuses it when another turn was recorded meanwhile (the history the
// answer was built on must stay the conversation's history: it is resent verbatim, append-only).
import type Anthropic from '@anthropic-ai/sdk';
import { and, asc, desc, eq, like } from 'drizzle-orm';
import type { AnswerPart, ConversationView, DraftView, TurnView } from '@/domain/assistant-answer';
import type { Lang } from '@/i18n/translate';
import { parisParts } from '@/lib/dates';
import { businessNow, businessToday } from '@/server/clock';
import { getConfig } from '@/server/config';
import { getDb } from '@/server/db/client';
import { assistantConversations, assistantTurns } from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { log } from '@/server/log';
import type { Viewer } from '@/server/viewer';
import { answerWithClaude, CLAUDE_FAILURE_NOTICE, ClaudeAssistantError, questionMessage, type ClaudeClientFactory, type ClaudeSettings, type Lookup } from './claude';
import type { NeedDraft } from './facts';
import { answerLocally } from './local';

export const ASSISTANT_LIMITS = { questionChars: 2000, turnsPerConversation: 40 } as const;

/** Every profile but the administrator, who has no planning workspace. */
export const canUseAssistant = (role: string) => role !== 'admin';

/** Claude settings when the assistant may use Claude (CRUCIBLE_AI=claude and a key), else null: the templates answer. */
export function assistantSettings(): ClaudeSettings | null {
  const ai = getConfig().ai;
  return ai.provider === 'claude' && ai.apiKey ? { apiKey: ai.apiKey, model: ai.model, fallbacks: ai.fallbacks } : null;
}

/** What the panel says about the provider. */
export function assistantStatus(): { provider: 'local' | 'claude'; model: string | null } {
  const s = assistantSettings();
  return { provider: s ? 'claude' : 'local', model: s?.model ?? null };
}

type TurnRow = typeof assistantTurns.$inferSelect;

/** "AS-2026-0001 #3": how a turn is cited in the audit trail. */
export const turnCitation = (conversationRef: string, seq: number) => `${conversationRef} #${seq}`;

function draftView(d: Record<string, unknown> | null): DraftView | null {
  if (!d) return null;
  const x = d as unknown as { draft: NeedDraft; warnings: string[] };
  return {
    projectCode: x.draft.projectCode, level: x.draft.level, title: x.draft.title, testTypeCode: x.draft.testTypeCode, resourceCode: x.draft.resourceCode,
    halfDays: x.draft.halfDays, milestoneLabel: x.draft.milestoneLabel, earliestOn: x.draft.earliestOn, deadlineOn: x.draft.deadlineOn, warnings: x.warnings ?? [],
  };
}

export function turnView(t: TurnRow): TurnView {
  return {
    id: t.id, seq: t.seq, question: t.question, provider: t.provider === 'claude' ? 'claude' : 'local', model: t.model,
    answer: t.answer as unknown as AnswerPart[], lookups: [...new Set((t.lookups as unknown as Lookup[]).map((l) => l.tool))],
    draft: draftView(t.draft), notice: t.notice, at: t.createdAt.toISOString(),
  };
}

async function conversationOf(q: Tx | Awaited<ReturnType<typeof getDb>>, viewer: Viewer, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await q.select().from(assistantConversations).where(and(eq(assistantConversations.id, id), eq(assistantConversations.userId, viewer.userId)));
  return c ?? null;
}

/** A conversation of the viewer with its turns (null when it is not theirs). */
export async function conversationView(viewer: Viewer, id: string): Promise<ConversationView | null> {
  const db = await getDb();
  const c = await conversationOf(db, viewer, id);
  if (!c) return null;
  const turns = await db.select().from(assistantTurns).where(eq(assistantTurns.conversationId, c.id)).orderBy(asc(assistantTurns.seq));
  return { id: c.id, ref: c.ref, turns: turns.map(turnView) };
}

/** The viewer's latest conversation, or null. */
export async function latestConversation(viewer: Viewer): Promise<ConversationView | null> {
  const db = await getDb();
  const [c] = await db.select({ id: assistantConversations.id }).from(assistantConversations).where(eq(assistantConversations.userId, viewer.userId))
    .orderBy(desc(assistantConversations.createdAt)).limit(1);
  return c ? conversationView(viewer, c.id) : null;
}

/** A need draft of one of the viewer's turns, with the citation the need's audit row will carry. */
export async function draftOfTurn(viewer: Viewer, turnId: string): Promise<(NeedDraft & { citation: string; turnId: string; warnings: string[] }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(turnId)) return null;
  const db = await getDb();
  const [r] = await db.select({ t: assistantTurns, ref: assistantConversations.ref }).from(assistantTurns)
    .innerJoin(assistantConversations, eq(assistantConversations.id, assistantTurns.conversationId))
    .where(and(eq(assistantTurns.id, turnId), eq(assistantConversations.userId, viewer.userId)));
  if (!r?.t.draft) return null;
  const d = r.t.draft as unknown as { draft: NeedDraft; warnings: string[] };
  return { ...d.draft, warnings: d.warnings ?? [], citation: turnCitation(r.ref, r.t.seq), turnId: r.t.id };
}

/** The citation of a turn of the viewer (for the audit row of the write it prepared), else null. */
export async function citationOf(q: Tx, viewer: Viewer, turnId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(turnId)) return null;
  const [r] = await q.select({ seq: assistantTurns.seq, ref: assistantConversations.ref }).from(assistantTurns)
    .innerJoin(assistantConversations, eq(assistantConversations.id, assistantTurns.conversationId))
    .where(and(eq(assistantTurns.id, turnId), eq(assistantConversations.userId, viewer.userId)));
  return r ? turnCitation(r.ref, r.seq) : null;
}

async function nextConversationRef(tx: Tx, year: string): Promise<string> {
  const [last] = await tx.select({ ref: assistantConversations.ref }).from(assistantConversations).where(like(assistantConversations.ref, `AS-${year}-%`))
    .orderBy(desc(assistantConversations.ref)).limit(1);
  return `AS-${year}-${String(last ? Number(last.ref.slice(8)) + 1 : 1).padStart(4, '0')}`;
}

/** The API history of the previous turns: Claude's messages verbatim; a templated turn as its question and a plain note. */
function historyOf(turns: readonly TurnRow[]): Anthropic.Beta.BetaMessageParam[] {
  return turns.flatMap((t): Anthropic.Beta.BetaMessageParam[] =>
    t.apiMessages ? (t.apiMessages as unknown as Anthropic.Beta.BetaMessageParam[])
      : [{ role: 'user', content: t.question }, { role: 'assistant', content: '(Answered by Crucible’s templates, without AI.)' }]);
}

export interface AskInput {
  conversationId: string | null;
  question: string;
  /** The page open when the question was asked (context for the answer). */
  page: string;
}

export interface AskDeps {
  /** Overrides the configured Claude settings (tests); null forces the templates. */
  settings?: ClaudeSettings | null;
  makeClient?: ClaudeClientFactory;
}

export async function askAssistant(viewer: Viewer, lang: Lang, input: AskInput, deps: AskDeps = {}): Promise<{ ok: true; conversation: ConversationView } | { ok: false; error: string }> {
  if (!canUseAssistant(viewer.role)) return { ok: false, error: 'This action is not in your workspace' };
  const question = input.question.replace(/\s+$/g, '').trim();
  if (!question) return { ok: false, error: 'Write a question' };
  if (question.length > ASSISTANT_LIMITS.questionChars) return { ok: false, error: 'The question is too long' };
  const page = /^\/[\w\-/[\]?=&.%]*$/.test(input.page) ? input.page.slice(0, 200) : '/';
  const db = await getDb();
  const conv = input.conversationId ? await conversationOf(db, viewer, input.conversationId) : null;
  if (input.conversationId && !conv) return { ok: false, error: 'Not found, or outside your workspace' };
  const previous = conv ? await db.select().from(assistantTurns).where(eq(assistantTurns.conversationId, conv.id)).orderBy(asc(assistantTurns.seq)) : [];
  if (previous.length >= ASSISTANT_LIMITS.turnsPerConversation) return { ok: false, error: 'This conversation is long: start a new one' };
  const settings = deps.settings === undefined ? assistantSettings() : deps.settings;
  const today = await businessToday();

  let answer: { provider: 'local' | 'claude'; model: string | null; parts: AnswerPart[]; apiMessages: Record<string, unknown>[] | null; lookups: Lookup[]; draft: Record<string, unknown> | null; notice: string | null; usage: Record<string, unknown> | null };
  let failure: string | null = null;
  if (settings) {
    try {
      const r = await answerWithClaude(viewer, historyOf(previous), questionMessage(question, { today, role: viewer.role, page, lang }), settings, deps.makeClient);
      answer = {
        provider: 'claude', model: r.model, parts: [{ kind: 'text', text: r.text || '…' }], apiMessages: r.apiMessages as unknown as Record<string, unknown>[],
        lookups: r.lookups, draft: r.draft as unknown as Record<string, unknown> | null, notice: null, usage: r.usage,
      };
    } catch (e) {
      const err = e instanceof ClaudeAssistantError ? e : new ClaudeAssistantError('error', e instanceof Error ? e.message : String(e));
      log.warn('assistant: Claude did not answer, templates used', { code: err.code, detail: err.message });
      failure = CLAUDE_FAILURE_NOTICE[err.code];
    }
  }
  // Without Claude, or after a failure: the templates.
  answer ??= await (async () => {
    const l = await answerLocally(viewer, question, lang);
    return { provider: 'local' as const, model: null, parts: l.parts, apiMessages: null, lookups: l.lookups, draft: null, notice: failure, usage: null };
  })();

  const now = await businessNow();
  const r = await db.transaction(async (tx): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
    let id = conv?.id ?? null;
    if (id) {
      const [last] = await tx.select({ seq: assistantTurns.seq }).from(assistantTurns).where(eq(assistantTurns.conversationId, id)).orderBy(desc(assistantTurns.seq)).limit(1);
      if ((last?.seq ?? 0) !== previous.length) return { ok: false, error: 'Another question was answered in this conversation meanwhile: ask again' };
    } else {
      const ref = await nextConversationRef(tx, parisParts(now).iso.slice(0, 4));
      const [c] = await tx.insert(assistantConversations).values({ ref, userId: viewer.userId, userName: viewer.name, role: viewer.role, createdAt: now }).returning({ id: assistantConversations.id });
      id = c.id;
    }
    await tx.insert(assistantTurns).values({
      conversationId: id, seq: previous.length + 1, role: viewer.role, question, provider: answer.provider, model: answer.model,
      answer: answer.parts as unknown as Record<string, unknown>[], apiMessages: answer.apiMessages, lookups: answer.lookups as unknown as Record<string, unknown>[],
      draft: answer.draft, notice: answer.notice, usage: answer.usage, createdAt: now,
    });
    return { ok: true, id };
  });
  if (!r.ok) return r;
  const view = await conversationView(viewer, r.id);
  return view ? { ok: true, conversation: view } : { ok: false, error: 'Not found, or outside your workspace' };
}

/** The arbitration minutes a templated turn of the viewer drafted: the conflict and the text (null when the turn has none). */
export async function minutesOfTurn(viewer: Viewer, turnId: string): Promise<{ conflictRef: string; text: string; turnId: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(turnId)) return null;
  const db = await getDb();
  const [r] = await db.select({ t: assistantTurns }).from(assistantTurns)
    .innerJoin(assistantConversations, eq(assistantConversations.id, assistantTurns.conversationId))
    .where(and(eq(assistantTurns.id, turnId), eq(assistantConversations.userId, viewer.userId)));
  if (!r) return null;
  const parts = r.t.answer as unknown as AnswerPart[];
  const title = parts.find((p): p is Extract<AnswerPart, { kind: 'title' }> => p.kind === 'title' && p.en === 'Conflict');
  const text = parts.find((p): p is Extract<AnswerPart, { kind: 'text' }> => p.kind === 'text');
  return title?.ref && text ? { conflictRef: title.ref, text: text.text, turnId: r.t.id } : null;
}
