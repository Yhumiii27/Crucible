// Delivery 6 on a fresh PostgreSQL database with the demo data set, demo mode ("View as"): the assistant with its templates (no
// AI provider, the default) and with Claude replaced by a scripted client (no test reaches the network). It reads with the
// asker's rights, sends nothing confidential to the provider (I-4), writes nothing in the planning, keeps its exchanges
// append-only, and the need or the decision a person records from what it prepared cites the exchange in the audit trail.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import Anthropic from '@anthropic-ai/sdk';
import { desc, eq, sql } from 'drizzle-orm';
import type { AnswerPart } from '@/domain/assistant-answer';
import { REAL_CLOCK } from '@/domain/clock';
import { createNeedAction } from '@/features/needs/actions';
import { decideConflictAction } from '@/features/planning/actions';
import { parisInstant } from '@/lib/dates';
import { askAssistant, draftOfTurn, minutesOfTurn, type AskDeps } from '@/server/assistant/service';
import { setClockForTests } from '@/server/clock';
import { assistantTurns, auditEntries, conflicts, resources, scenarios } from '@/server/db/schema';
import { getViewer } from '@/server/session';
import { testDatabase, type TestDatabase } from '@/test/db';

let t: TestDatabase;
beforeAll(async () => {
  t = await testDatabase();
  setClockForTests(REAL_CLOCK);
});
afterAll(async () => {
  setClockForTests(null);
  await t.close();
});
beforeEach(() => {
  jar.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(parisInstant('2026-10-22', '11:00'));
});
afterEach(() => vi.useRealTimers());

const as = (role: string) => jar.set('crucible-role', role);
const LOCAL: AskDeps = { settings: null };
const ask = async (role: string, question: string, conversationId: string | null = null, deps: AskDeps = LOCAL) => {
  as(role);
  return askAssistant(await getViewer(), 'fr', { conversationId, question, page: '/propose' }, deps);
};
const lastTurn = (r: Awaited<ReturnType<typeof ask>>) => {
  if (!r.ok) throw new Error(r.error);
  return r.conversation.turns[r.conversation.turns.length - 1];
};
const tables = (parts: AnswerPart[]) => parts.filter((p): p is Extract<AnswerPart, { kind: 'table' }> => p.kind === 'table');
const lastAudit = async (objectRef: string) => (await t.db.select().from(auditEntries).where(eq(auditEntries.objectRef, objectRef)).orderBy(desc(auditEntries.id)).limit(1))[0];
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

describe('the assistant without an AI provider (templates)', () => {
  it('why is a need placed there: rank, the slot, and every earlier slot with the rule and the need that held it', async () => {
    const r = await ask('coordinator', 'Pourquoi N-2026-0002 est-il proposé le 16 et pas le 14 ?');
    const turn = lastTurn(r);
    expect(r.ok && r.conversation.ref).toBe('AS-2026-0001');
    expect(turn).toMatchObject({ seq: 1, provider: 'local', model: null, lookups: ['explain_need'], draft: null, notice: null });
    expect(turn.answer[0]).toEqual({ kind: 'title', en: 'Need', ref: 'N-2026-0002' });
    const [why, before] = tables(turn.answer);
    // The pilot zone's neighbour holds the building on 14–15 Dec (one zone at a time): the regulatory test of Cassiopée, served first.
    expect(why.rows).toEqual([['PDE-ATM', '2026-12-14 am → 2026-12-15 am', { en: 'Exclusion rule', ref: 'PDE-ONE-ZONE · PDE-LAB' }, 'N-2026-0003']]);
    // The coordinator does not see the confidential project: its need is named by reference only.
    expect(before.rows).toEqual([['N-2026-0003', { en: 'Project not visible' }]]);
  });

  it('the conversation goes on; the partner does not see the PDE; the administrator has no assistant', async () => {
    const first = await ask('coordinator', 'Bonjour');
    const id = first.ok ? first.conversation.id : '';
    const next = await ask('coordinator', 'Quels projets risquent de manquer de PDE au premier trimestre ?', id);
    expect(next.ok && next.conversation.turns.map((x) => [x.seq, x.lookups])).toEqual([[1, ['get_context']], [2, ['load_risks']]]);
    expect(lastTurn(await ask('partner', 'Pourquoi N-2026-0002 ?')).answer).toEqual([{ kind: 'note', en: 'Not found, or outside your workspace' }]);
    // Another person's conversation is not theirs to continue.
    expect(await ask('partner', 'Et ensuite ?', id)).toEqual({ ok: false, error: 'Not found, or outside your workspace' });
    expect(await ask('admin', 'Bonjour')).toEqual({ ok: false, error: 'This action is not in your workspace' });
  });

  it('a what-if: the confirmed test of 27 Oct is moved on paper, nothing is recorded; a technician may not simulate', async () => {
    const before = (await t.db.select({ n: sql<number>`count(*)::int` }).from(scenarios))[0].n;
    const turn = lastTurn(await ask('coordinator', 'Et si PDE-PIL était en panne le 27/10 ?'));
    expect(turn.answer[0]).toEqual({ kind: 'title', en: 'What if', ref: 'PDE-PIL · 2026-10-27' });
    expect(tables(turn.answer)[0].rows[0].slice(0, 4)).toEqual([expect.stringMatching(/^B-2026-/), 'N-2026-0004', 'RD-ORION', '2026-10-27 am']);
    expect((await t.db.select({ n: sql<number>`count(*)::int` }).from(scenarios))[0].n).toBe(before);
    expect(lastTurn(await ask('technician', 'Et si PDE-PIL était en panne le 27/10 ?')).answer[0]).toEqual({ kind: 'note', en: 'Simulations are for the R&D director, the coordinator and the project leads' });
  });

  it('the minutes of an arbitration: the decision starts from them and its audit row cites the exchange', async () => {
    const turn = lastTurn(await ask('coordinator', 'Résume le conflit C-2026-0001 pour le comité'));
    const minutes = await minutesOfTurn(await getViewer(), turn.id);
    expect(minutes?.conflictRef).toBe('C-2026-0001');
    expect(minutes?.text).toContain('Règle de priorité appliquée : Essai de sécurité ou réglementaire (rang 1, version 1).');
    const [c] = await t.db.select().from(conflicts).where(eq(conflicts.ref, 'C-2026-0001'));
    const r = await decideConflictAction(null, form({ conflictId: c.id, optionKey: c.recommendedKey, reason: minutes!.text, assistantTurn: turn.id }));
    expect(r).toEqual({ ok: true });
    const conv = (await t.db.select({ ref: sql<string>`ref` }).from(sql`crucible.assistant_conversations`).where(sql`id = (select conversation_id from crucible.assistant_turns where id = ${turn.id})`))[0].ref;
    expect((await lastAudit('Conflict C-2026-0001')).change).toBe(`decided: ${c.recommendedKey} · prepared with the assistant · ${conv} #1`);
    // Another person's turn is not cited.
    as('rd_director');
    expect(await minutesOfTurn(await getViewer(), turn.id)).toBeNull();
  });

  it('turns are append-only', async () => {
    await expect(t.db.update(assistantTurns).set({ question: 'changed' })).rejects.toThrow();
    await expect(t.db.delete(assistantTurns)).rejects.toThrow();
  });
});

// ── Claude, scripted ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Reply = { content: Anthropic.Beta.BetaContentBlock[]; stop: Anthropic.Beta.BetaStopReason };
const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ type: 'tool_use', id, name, input }) as unknown as Anthropic.Beta.BetaContentBlock;
const text = (s: string) => ({ type: 'text', text: s, citations: null }) as unknown as Anthropic.Beta.BetaContentBlock;

/** A client whose `beta.messages.create` returns the replies in turn and records every request. */
function scripted(replies: (Reply | Error)[]) {
  const calls: Anthropic.Beta.MessageCreateParams[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: Anthropic.Beta.MessageCreateParams) => {
          calls.push(JSON.parse(JSON.stringify(params)));
          const r = replies.shift();
          if (!r) throw new Error('no scripted reply');
          if (r instanceof Error) throw r;
          return { id: `msg_${calls.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: r.content, stop_reason: r.stop, stop_details: null, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0 } };
        },
      },
    },
  } as unknown as Anthropic;
  return { calls, deps: { settings: { apiKey: 'sk-test', model: 'claude-opus-5-5', fallbacks: true }, makeClient: () => client } satisfies AskDeps };
}

describe('the assistant with Claude (scripted client)', () => {
  it('nothing confidential is sent (I-4): the project lead of Cassiopée asks, the provider gets a marker and a refusal', async () => {
    const s = scripted([
      { content: [toolUse('t1', 'get_context', {}), toolUse('t2', 'explain_need', { ref: 'N-2026-0003' })], stop: 'tool_use' },
      { content: [text('Ce besoin relève d’un projet confidentiel : je ne peux pas l’expliquer ici.')], stop: 'end_turn' },
    ]);
    const turn = lastTurn(await ask('project_lead', 'Pourquoi N-2026-0003 est-il placé ainsi ?', null, s.deps));
    expect(turn).toMatchObject({ provider: 'claude', model: 'claude-opus-5-5', lookups: ['get_context', 'explain_need'], notice: null });
    expect(turn.answer).toEqual([{ kind: 'text', text: 'Ce besoin relève d’un projet confidentiel : je ne peux pas l’expliquer ici.' }]);
    const sent = JSON.stringify(s.calls);
    expect(sent).not.toMatch(/CASSIOPEE|Cassiop/i);
    expect(sent).toContain('This need belongs to a confidential project: it is not sent to the AI provider');
    expect(sent).toContain('RD-ORION');
    // The request: system prompt cached, strict tools, effort set, the refusal fallback.
    expect(s.calls[0]).toMatchObject({ model: 'claude-opus-5-5', output_config: { effort: 'medium' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    expect(s.calls[0].tools?.every((x) => 'strict' in x && x.strict)).toBe(true);
    expect(s.calls[0]).not.toHaveProperty('temperature');
    expect(s.calls[0]).not.toHaveProperty('tool_choice');
  });

  it('a need in plain words: Claude prepares it, the person opens the form and records it, the audit row cites the exchange', async () => {
    const s = scripted([
      { content: [toolUse('t1', 'prepare_need', { project: 'RD-ORION', level: 'request', title: 'Six qualification firings', test_type: 'FIRING', resource: null, half_days: 6, milestone: 'Qualification review', earliest_on: '2027-01-04', deadline_on: null, note: null })], stop: 'tool_use' },
      { content: [text('J’ai préparé le besoin : ouvrez le formulaire pour le vérifier et l’enregistrer.')], stop: 'end_turn' },
    ]);
    const r = await ask('project_lead', 'J’ai 6 tirs de qualification à faire avant la revue de qualification d’Orion, au PDE', null, s.deps);
    const turn = lastTurn(r);
    expect(turn.draft).toMatchObject({ projectCode: 'RD-ORION', level: 'request', resourceCode: 'PDE-PIL', halfDays: 6, milestoneLabel: 'Qualification review', earliestOn: '2027-01-04', deadlineOn: '2027-01-15' });
    const v = await getViewer();
    const d = (await draftOfTurn(v, turn.id))!;
    const created = await createNeedAction(null, form({
      projectCode: d.projectCode, level: d.level, title: d.title, resourceId: d.resourceId, halfDays: String(d.halfDays), milestoneId: d.milestoneId ?? '',
      testTypeCode: d.testTypeCode ?? '', earliestOn: d.earliestOn, deadlineOn: d.deadlineOn, assistantTurn: turn.id,
    }));
    expect(created.ok).toBe(true);
    const audit = (await t.db.select().from(auditEntries).where(sql`${auditEntries.change} like '%prepared with the assistant%' and ${auditEntries.area} = 'Needs'`))[0];
    expect(audit.change).toBe(`request recorded: 6 half-days · 2027-01-04 → 2027-01-15 · prepared with the assistant · ${r.ok ? r.conversation.ref : ''} #1`);
    // The draft is the person's own: another profile does not get it.
    as('coordinator');
    expect(await draftOfTurn(await getViewer(), turn.id)).toBeNull();
  });

  it('the next turn resends the previous messages unchanged; a failure answers with the templates and says why', async () => {
    const s = scripted([
      { content: [text('Première réponse.')], stop: 'end_turn' },
      { content: [text('Deuxième réponse.')], stop: 'end_turn' },
      new Anthropic.APIConnectionError({ message: 'offline' }),
    ]);
    const first = await ask('coordinator', 'Bonjour', null, s.deps);
    const id = first.ok ? first.conversation.id : '';
    await ask('coordinator', 'Et le PDE ?', id, s.deps);
    const stored = (await t.db.select().from(assistantTurns).where(eq(assistantTurns.conversationId, id)).orderBy(assistantTurns.seq))[0].apiMessages;
    expect(s.calls[1].messages.slice(0, 2)).toEqual(stored);
    const failed = lastTurn(await ask('coordinator', 'Résume le conflit C-2026-0001', id, s.deps));
    expect(failed).toMatchObject({ provider: 'local', notice: 'Claude could not be reached', lookups: ['explain_conflict'] });
    // A refusal stops the turn: the templates answer.
    const refused = scripted([{ content: [], stop: 'refusal' }]);
    expect(lastTurn(await ask('coordinator', 'Bonjour', null, refused.deps))).toMatchObject({ provider: 'local', notice: 'Claude declined to answer this question' });
  });

  it('a tool the model invents, or a bad input, is answered as an error; the resource codes stay the viewer’s', async () => {
    const s = scripted([
      { content: [toolUse('t1', 'book_slot', { ref: 'N-2026-0002' }), toolUse('t2', 'find_alternatives', { test_type: 'FORMULATION', resource: null, from_on: '2026-10-26', to_on: '2026-10-30', half_days: 2 })], stop: 'tool_use' },
      { content: [text('LAB67-ANA est libre lundi.')], stop: 'end_turn' },
    ]);
    const turn = lastTurn(await ask('partner', 'Où faire un essai FORMULATION la semaine prochaine ?', null, s.deps));
    const results = JSON.stringify(s.calls[1].messages.at(-1));
    expect(results).toContain('Unknown tool book_slot');
    // The partner sees laboratoire 67 only: the PDE's laboratory is not offered.
    expect(results).toContain('LAB67-ANA');
    expect(results).not.toContain('PDE-LAB');
    expect(turn.lookups).toEqual(['book_slot', 'find_alternatives']);
    const [lab] = await t.db.select().from(resources).where(eq(resources.code, 'LAB67-ANA'));
    expect(lab).toBeTruthy();
  });
});
