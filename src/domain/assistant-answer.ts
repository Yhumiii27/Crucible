// The shape of an assistant answer (spec 04; delivery 6), stored with its turn and shown by the panel. A model answer is text,
// shown as written (never through t()). A templated answer is made of parts whose labels are EN source strings (translated) and
// whose values are data (codes, dates, typed text: shown as is). Pure, no import.

/** A table cell: data as is, or an EN label (translated), after a number and before a reference: "3 working days · PDE-ATM". */
export type Cell = string | { en: string; ref?: string | null; num?: string | null };

export type AnswerPart =
  | { kind: 'text'; text: string }
  | { kind: 'title'; en: string; ref?: string | null }
  | { kind: 'facts'; rows: { en: string; value: Cell }[] }
  | { kind: 'table'; columns: string[]; rows: Cell[][] }
  | { kind: 'note'; en: string; ref?: string | null }
  /** `turn`: the panel adds `turn=<id of this turn>` to the link (a form opened prefilled with what the turn prepared). */
  | { kind: 'links'; links: { en: string; href: string; turn?: boolean }[] }
  | { kind: 'examples'; questions: string[] };

/** A need the assistant prepared: the person opens the needs form filled with it, checks, and records it (or not). */
export interface DraftView {
  projectCode: string;
  level: string;
  title: string;
  testTypeCode: string | null;
  resourceCode: string;
  halfDays: number;
  milestoneLabel: string | null;
  earliestOn: string;
  deadlineOn: string;
  warnings: string[];
}

export interface TurnView {
  id: string;
  seq: number;
  question: string;
  provider: 'local' | 'claude';
  model: string | null;
  answer: AnswerPart[];
  /** What was looked up (names of the lookups, EN). */
  lookups: string[];
  draft: DraftView | null;
  notice: string | null;
  at: string;
}

export interface ConversationView {
  id: string;
  ref: string;
  turns: TurnView[];
}

/** The lookups an answer may make, EN labels shown under the answer ("looked up: …"). */
export const LOOKUP_LABEL: Record<string, string> = {
  get_context: 'Reference data',
  explain_need: 'Trace of the engine',
  explain_conflict: 'Conflict sheet',
  find_alternatives: 'Free slots and validated substitutions',
  load_risks: 'Load forecast',
  simulate_outage: 'Simulation (not recorded)',
  prepare_need: 'Need draft (not recorded)',
};
