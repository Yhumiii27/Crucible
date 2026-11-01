'use server';
// Server Functions of the assistant panel (docs/spec/04, 05 "Assistant: panneau de conversation disponible sur chaque écran";
// delivery 6). The assistant reads with the asker's rights and writes nothing in the planning: it records its own exchange
// (src/server/assistant/service.ts). Input is checked server-side; the viewer and the language come from the session.
import type { ConversationView } from '@/domain/assistant-answer';
import { askAssistant, assistantStatus, canUseAssistant, conversationView, latestConversation } from '@/server/assistant/service';
import { getLang, getViewer } from '@/server/session';
import { hitRate } from '@/server/http/rate-limit';

export type AssistantState = { provider: 'local' | 'claude'; model: string | null; conversation: ConversationView | null };

/** The panel's state: the provider, and the latest conversation of the viewer (or the one asked). */
export async function loadAssistantAction(conversationId: string | null): Promise<AssistantState | null> {
  const v = await getViewer();
  if (!canUseAssistant(v.role)) return null;
  const conversation = typeof conversationId === 'string' && conversationId ? await conversationView(v, conversationId) : await latestConversation(v);
  return { ...assistantStatus(), conversation };
}

/** One question; `conversationId` null starts a new conversation. */
export async function askAssistantAction(conversationId: string | null, question: string, page: string): Promise<{ ok: true; conversation: ConversationView } | { ok: false; error: string }> {
  const v = await getViewer();
  if (typeof question !== 'string' || typeof page !== 'string' || (conversationId !== null && typeof conversationId !== 'string')) return { ok: false, error: 'Write a question' };
  // CR-079: at most 30 questions per person and 10 minutes.
  if (!(await hitRate('assistant', v.userId, { name: v.name, userId: v.userId, role: v.role })).ok) return { ok: false, error: 'Too many questions: try again in a few minutes' };
  return askAssistant(v, await getLang(), { conversationId, question, page });
}
