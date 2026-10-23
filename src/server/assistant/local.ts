import 'server-only';
// The assistant without an AI provider (spec 04 §3, "repli sans IA"; I-3: the default until the IT department validates one).
// The question is routed by src/domain/assistant-intents.ts to one lookup of ./facts.ts, and the facts are laid out as an
// answer: labels are EN source strings (translated on screen), values are data. Nothing leaves Crucible.
import { parseQuestion, type Intent } from '@/domain/assistant-intents';
import type { AnswerPart, Cell } from '@/domain/assistant-answer';
import { makeT, type Lang } from '@/i18n/translate';
import { ROLE_LABEL, isRoleKey } from '@/config/roles';
import { mondayOf } from '@/domain/calendar';
import { canDecide } from '@/domain/conflicts';
import type { Viewer } from '@/server/viewer';
import {
  PROJECT_CONFIDENTIAL, PROJECT_NOT_VISIBLE, alternativesFacts, conflictFacts, contextFacts, loadRiskFacts, needFacts, simulationFacts,
  type AlternativesFacts, type ConflictFacts, type ContextFacts, type LoadRiskFacts, type NeedFacts, type SimulationFacts,
} from './facts';

export interface LocalAnswer {
  parts: AnswerPart[];
  /** Lookup names (./claude.ts tool names), for the record. */
  lookups: { tool: string; input: Record<string, unknown>; ok: boolean }[];
}

const project = (label: string): Cell => (label === PROJECT_NOT_VISIBLE || label === PROJECT_CONFIDENTIAL ? { en: label } : label);
const span = (from: string, to: string) => (from === to ? from : `${from} → ${to}`);

/** "yes" / "no" / "3 working days" / "requested on 2026-09-30" / "P2" as a cell. */
function criterionCell(v: string): Cell {
  if (v === 'yes' || v === 'no') return { en: v === 'yes' ? 'Yes' : 'No' };
  const days = /^(-?\d+) working days$/.exec(v);
  if (days) return { en: 'working days', num: days[1] };
  const asked = /^requested on (.+)$/.exec(v);
  if (asked) return { en: 'Requested on', ref: asked[1] };
  return v;
}

function needParts(f: NeedFacts): AnswerPart[] {
  const n = f.need;
  const parts: AnswerPart[] = [{ kind: 'title', en: 'Need', ref: n.ref }];
  const rows: { en: string; value: Cell }[] = [
    { en: 'Project', value: project(n.project) },
    ...(n.title ? [{ en: 'Tests needed', value: n.title }] : []),
    { en: 'Resource', value: `${n.resource} · ${n.facility}` },
    { en: 'Window', value: `${n.earliestOn} → ${n.deadlineOn}` },
    { en: 'Half-days left to place', value: `${n.remainingHalfDays} / ${n.halfDays}` },
  ];
  if (f.serviceOrder) rows.push({ en: 'Rank in the service order', value: `${f.serviceOrder.rank} / ${f.serviceOrder.of} · v${f.serviceOrder.ruleVersion}` });
  if (f.slot)
    rows.push({ en: f.slot.substitute ? 'Slot proposed on a validated substitute' : 'Slot proposed', value: `${f.slot.resource} · ${span(f.slot.from, f.slot.to)}` },
      { en: 'Working days late', value: String(f.slot.lateDays) });
  else if (f.unplacedReason) rows.push({ en: 'Not placed', value: { en: f.unplacedReason } });
  else if (n.remainingHalfDays === 0) rows.push({ en: 'Not placed', value: { en: 'Nothing left to place: the need is booked' } });
  parts.push({ kind: 'facts', rows });
  if (f.waitedFor.length) {
    parts.push({ kind: 'note', en: 'Why not earlier: every earlier slot and the first constraint it fails' });
    parts.push({
      kind: 'table', columns: ['Resource', 'Slots', 'Cause', 'Held by'],
      rows: f.waitedFor.map((w) => [w.resource, span(w.from, w.to), { en: w.cause, ref: w.ref }, w.heldBy.join(', ')]),
    });
  } else if (f.slot) parts.push({ kind: 'note', en: 'This is the first slot of its window that passes every constraint' });
  if (f.servedBefore.length) {
    parts.push({ kind: 'note', en: 'Served before it by the priority rules, and holding a slot it could have taken' });
    parts.push({ kind: 'table', columns: ['Need', 'Project'], rows: f.servedBefore.map((s) => [s.ref, project(s.project)]) });
  }
  if (f.serviceOrder?.criteria.length) {
    parts.push({ kind: 'note', en: 'The priority rules, in their order: the first criterion where two needs differ decides which is served first' });
    parts.push({ kind: 'table', columns: ['Priority criterion', 'This need'], rows: f.serviceOrder.criteria.map((c) => [{ en: c.criterion }, criterionCell(c.value)]) });
  }
  if (f.latestRun?.differs) parts.push({ kind: 'note', en: 'The planning changed since the latest run of the engine: this explanation is on the current state', ref: f.latestRun.ref });
  if (f.booked.length) parts.push({ kind: 'table', columns: ['Booking', 'Resource', 'Slots', 'Status'], rows: f.booked.map((b) => [b.ref, b.resource, span(b.from, b.to), b.status]) });
  parts.push({ kind: 'links', links: [{ en: 'Proposals', href: '/propose' }, ...(n.project !== PROJECT_NOT_VISIBLE && n.project !== PROJECT_CONFIDENTIAL ? [{ en: 'Project sheet', href: `/projects/${n.project}` }] : [])] });
  return parts;
}

const letter = (i: number) => String.fromCharCode(65 + i);
/** "As proposed", or "Served first" (the order of an option that serves another need first). */
const optionName = (o: ConflictFacts['options'][number]) => (o.key === 'as_proposed' ? 'As proposed' : 'Served first');

/** Draft minutes of an arbitration (spec 04 §2, "prepare the arbitration"): a text the decider copies, edits and signs. */
export function arbitrationMinutes(f: ConflictFacts, lang: Lang): string {
  const fr = lang === 'fr';
  const t = makeT(lang);
  const name = (o: ConflictFacts['options'][number], k: number) =>
    `${fr ? 'Option' : 'Option'} ${letter(k)} (${o.key === 'as_proposed' ? (fr ? 'telle que proposée' : 'as proposed') : `${fr ? 'ordre' : 'order'} ${o.order.join(' → ')}`})`;
  const best = f.options.find((o) => o.recommended);
  const out = (o: ConflictFacts['options'][number]) =>
    o.outcomes.map((x) => x.resource
      ? `${x.need} ${fr ? 'sur' : 'on'} ${x.resource} ${fr ? 'du' : 'from'} ${x.from} ${fr ? 'au' : 'to'} ${x.to}${x.lateDays ? ` (${x.lateDays} ${fr ? `j ouvré${x.lateDays > 1 ? 's' : ''} de retard` : `working day${x.lateDays > 1 ? 's' : ''} late`})` : ''}`
      : `${x.need} ${fr ? 'non placé' : 'not placed'}`).join('; ');
  const needs = f.needs.map((n) => `${n.ref} (${n.project === PROJECT_NOT_VISIBLE ? (fr ? 'projet non visible' : 'project not visible') : n.project === PROJECT_CONFIDENTIAL ? (fr ? 'projet confidentiel' : 'confidential project') : n.project}, ${fr ? 'échéance' : 'deadline'} ${n.deadlineOn})`).join(', ');
  return fr
    ? [
      `Conflit ${f.ref} — ${f.subject}.`,
      `Besoins en concurrence : ${needs}.`,
      `Règle de priorité appliquée : ${t(f.ruleCited)}${f.ruleRank ? ` (rang ${f.ruleRank}, version ${f.ruleVersion})` : ''}.`,
      ...f.options.map((o, k) => `${name(o, k)}${o.recommended ? ', recommandée' : ''} : ${out(o)}.`),
      best ? `Proposition : retenir l’option ${letter(f.options.indexOf(best))}.` : '',
      `Décision attendue le ${f.dueOn}.`,
    ].filter(Boolean).join('\n')
    : [
      `Conflict ${f.ref} — ${f.subject}.`,
      `Needs in competition: ${needs}.`,
      `Priority rule applied: ${t(f.ruleCited)}${f.ruleRank ? ` (rank ${f.ruleRank}, version ${f.ruleVersion})` : ''}.`,
      ...f.options.map((o, k) => `${name(o, k)}${o.recommended ? ', recommended' : ''}: ${out(o)}.`),
      best ? `Proposal: keep option ${letter(f.options.indexOf(best))}.` : '',
      `Decision expected on ${f.dueOn}.`,
    ].filter(Boolean).join('\n');
}

function conflictParts(f: ConflictFacts, lang: Lang, decides: boolean): AnswerPart[] {
  const decider = isRoleKey(f.decider) ? ROLE_LABEL[f.decider] : f.decider;
  return [
    { kind: 'title', en: 'Conflict', ref: f.ref },
    {
      kind: 'facts', rows: [
        { en: 'Status', value: { en: f.status } },
        { en: 'Where they compete', value: f.subject },
        { en: 'Priority rule cited', value: f.ruleRank ? { en: f.ruleCited, ref: `#${f.ruleRank} · v${f.ruleVersion}` } : { en: f.ruleCited } },
        { en: 'Decides', value: { en: decider } },
        { en: 'Decision due', value: f.dueOn },
      ],
    },
    {
      kind: 'table', columns: ['Option', 'Need', 'Resource', 'Slots', 'Working days late'],
      rows: f.options.flatMap((o, k) => o.outcomes.map((x, i): Cell[] => [
        i === 0 ? { en: optionName(o), num: `${o.recommended ? '★ ' : ''}${letter(k)} ·` } : '',
        x.need, x.resource ?? { en: 'Not placed' }, x.from && x.to ? span(x.from, x.to) : '', x.lateDays == null ? '' : String(x.lateDays),
      ])),
    },
    { kind: 'note', en: '★ Recommended option' },
    ...(f.decisions.length ? [{ kind: 'table' as const, columns: ['Decision', 'Option', 'Reason', 'On'], rows: f.decisions.map((d): Cell[] => [{ en: d.kind === 'veto' ? 'Safety veto' : 'Decision' }, d.option ?? '', d.reason, d.on]) }] : []),
    { kind: 'note', en: 'Draft minutes of the arbitration, to copy into the decision and edit' },
    { kind: 'text', text: arbitrationMinutes(f, lang) },
    { kind: 'links', links: decides && f.open ? [{ en: 'Decide with these minutes', href: `/conflicts?ref=${f.ref}`, turn: true }] : [{ en: 'Conflicts', href: '/conflicts' }] },
  ];
}

function alternativesParts(f: AlternativesFacts): AnswerPart[] {
  return [
    { kind: 'title', en: 'Where to run the test', ref: f.testType },
    { kind: 'facts', rows: [{ en: 'Half-days', value: String(f.halfDays) }, { en: 'Window', value: `${f.window.from} → ${f.window.to}` }] },
    f.options.length
      ? {
        kind: 'table', columns: ['Resource', 'Facility', 'Kind', 'First free slot', 'Working days late'],
        rows: f.options.map((o): Cell[] => [o.resource, o.facility, { en: o.substitute ? 'Validated substitute' : 'Nominal resource' }, o.slot ? span(o.slot.from, o.slot.to) : { en: o.reason ?? 'No free slot in the horizon' }, o.slot ? String(o.slot.lateDays) : '']),
      }
      : { kind: 'note', en: 'No resource you see runs this test' },
    { kind: 'note', en: f.note },
    { kind: 'links', links: [{ en: 'Planning', href: `/planning?week=${mondayOf(f.window.from)}` }] },
  ];
}

function riskParts(f: LoadRiskFacts): AnswerPart[] {
  const parts: AnswerPart[] = [{ kind: 'title', en: 'Load risks', ref: `${f.window.from} → ${f.window.to}` }];
  if (!f.bottlenecks.length) parts.push({ kind: 'note', en: 'No bottleneck in this window' });
  for (const b of f.bottlenecks) {
    parts.push({ kind: 'facts', rows: [{ en: 'Bottleneck', value: b.subject }, { en: 'Weeks over capacity', value: b.weeks.map((w) => `${w.monday} ${w.loadPercent} %`).join(', ') }] });
    parts.push(b.needsAtRisk.length
      ? { kind: 'table', columns: ['Need', 'Project', 'Resource', 'Deadline', 'Half-days left'], rows: b.needsAtRisk.map((n) => [n.ref, project(n.project), n.resource, n.deadlineOn, String(n.remainingHalfDays)]) }
      : { kind: 'note', en: 'No open need left to place in these weeks: the load is booked' });
  }
  if (f.inspections.length)
    parts.push({ kind: 'note', en: 'Inspections falling due inside the window of a need' },
      { kind: 'table', columns: ['Need', 'Resource', 'Inspection', 'Due'], rows: f.inspections.map((i) => [i.need, i.resource, i.inspection, i.dueOn]) });
  parts.push({ kind: 'links', links: [{ en: 'Load plan', href: '/load' }] });
  return parts;
}

function simulationParts(f: SimulationFacts): AnswerPart[] {
  return [
    { kind: 'title', en: 'What if', ref: `${f.hypothesis.resource} · ${span(f.hypothesis.fromOn, f.hypothesis.toOn)}` },
    f.moved.length
      ? { kind: 'table', columns: ['Booking', 'Need', 'Project', 'Now', 'After', 'Resource'], rows: f.moved.map((m): Cell[] => [m.booking, m.need ?? '', project(m.project), m.from, m.to ?? { en: m.reason ?? 'Not placed' }, m.toResource ?? '']) }
      : { kind: 'note', en: 'No confirmed booking is touched' },
    ...(f.impacts.length ? [{ kind: 'table' as const, columns: ['Project', 'Booking', 'Deadline', 'Late before', 'Late after'], rows: f.impacts.map((i): Cell[] => [project(i.project), i.booking, i.deadlineOn, String(i.lateBefore), i.lateAfter == null ? { en: 'Not placed' } : String(i.lateAfter)]) }] : []),
    { kind: 'note', en: f.note },
    { kind: 'links', links: [{ en: 'Incidents', href: '/incidents' }] },
  ];
}

/** Example questions built on what the person sees (real references), in their language. */
export function examplesFor(c: ContextFacts, lang: Lang): string[] {
  const fr = lang === 'fr';
  const need = c.openNeeds[0]?.ref;
  const conflict = c.openConflicts[0];
  const type = c.testTypes.find((x) => x.validatedSubstitutes.length)?.code ?? c.testTypes[0]?.code;
  const fac = c.facilities[0]?.code;
  const res = c.resources[0]?.code;
  return [
    need && (fr ? `Pourquoi ${need} est-il placé ainsi ?` : `Why is ${need} placed this way?`),
    conflict && (fr ? `Résume le conflit ${conflict} pour le comité` : `Summarise conflict ${conflict} for the committee`),
    type && (fr ? `Où faire un essai ${type} cette semaine ?` : `Where can I run a ${type} test this week?`),
    fac && (fr ? `Quels projets risquent de manquer de ${fac} au premier trimestre ?` : `Which projects risk running short of ${fac} in the first quarter?`),
    res && ['rd_director', 'coordinator', 'project_lead'].includes(c.role) && (fr ? `Et si ${res} était en panne la semaine prochaine ?` : `What if ${res} were down next week?`),
  ].filter((x): x is string => !!x);
}

/** The intent of a question against what the person sees. */
export async function intentOf(viewer: Viewer, question: string): Promise<{ intent: Intent; context: ContextFacts }> {
  const context = await contextFacts(viewer, 'local');
  const intent = parseQuestion(question, { resources: context.resources.map((r) => r.code), testTypes: context.testTypes.map((x) => x.code), facilities: context.facilities.map((f) => f.code) }, context.today);
  return { intent, context };
}

export async function answerLocally(viewer: Viewer, question: string, lang: Lang): Promise<LocalAnswer> {
  const { intent, context } = await intentOf(viewer, question);
  const fail = (tool: string, input: Record<string, unknown>, error: string): LocalAnswer => ({ parts: [{ kind: 'note', en: error }], lookups: [{ tool, input, ok: false }] });
  switch (intent.kind) {
    case 'need': {
      const r = await needFacts(viewer, intent.ref, 'local');
      return r.ok ? { parts: needParts(r.facts), lookups: [{ tool: 'explain_need', input: { ref: intent.ref }, ok: true }] } : fail('explain_need', { ref: intent.ref }, r.error);
    }
    case 'conflict': {
      const r = await conflictFacts(viewer, intent.ref, 'local');
      return r.ok ? { parts: conflictParts(r.facts, lang, canDecide(viewer.role, r.facts.decider)), lookups: [{ tool: 'explain_conflict', input: { ref: intent.ref }, ok: true }] } : fail('explain_conflict', { ref: intent.ref }, r.error);
    }
    case 'alternatives': {
      const input = { test_type: intent.testType, resource: intent.resource, from_on: intent.fromOn, to_on: intent.toOn };
      const r = await alternativesFacts(viewer, { testType: intent.testType, resource: intent.resource, fromOn: intent.fromOn, toOn: intent.toOn });
      return r.ok ? { parts: alternativesParts(r.facts), lookups: [{ tool: 'find_alternatives', input, ok: true }] } : fail('find_alternatives', input, r.error);
    }
    case 'risks': {
      const input = { facility: intent.facility, quarter: intent.quarter };
      const r = await loadRiskFacts(viewer, intent, 'local');
      return r.ok ? { parts: riskParts(r.facts), lookups: [{ tool: 'load_risks', input, ok: true }] } : fail('load_risks', input, r.error);
    }
    case 'simulate': {
      const input = { resource: intent.resource, from_on: intent.fromOn, to_on: intent.toOn };
      const r = await simulationFacts(viewer, intent, 'local');
      return r.ok ? { parts: simulationParts(r.facts), lookups: [{ tool: 'simulate_outage', input, ok: true }] } : fail('simulate_outage', input, r.error);
    }
    case 'prepare':
      return {
        parts: [
          { kind: 'note', en: 'Without an AI provider, the assistant does not read a need written in plain words: enter it in the needs form' },
          { kind: 'links', links: [{ en: 'My test needs', href: '/my/needs' }] },
        ],
        lookups: [],
      };
    case 'help':
      return {
        parts: [
          { kind: 'note', en: 'Without an AI provider, the assistant answers from Crucible’s data with templates. Ask about a need, a conflict, where to run a test, the load risks or a resource out, for example:' },
          { kind: 'examples', questions: examplesFor(context, lang) },
        ],
        lookups: [{ tool: 'get_context', input: {}, ok: true }],
      };
  }
}
