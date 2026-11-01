// Forms of a booking (CR-075, X-14): what a facility asks before, after and during a test. Pure: a template is a list of items
// typed one per line by the facility's manager (a line starting with "=" asks a written answer, any other line a box to tick);
// every item is required. A filled form keeps a copy of the items it answered (a template can change afterwards).
//   before    safety checklist: a test cannot be started on screen until it is filled for the booking;
//   after     test sheet: filled once the test is over (shown as "to fill" until then);
//   incident  incident report: filled while the test runs, as often as needed; the facility's managers are told.

export const FORM_STAGES = ['before', 'after', 'incident'] as const;
export type FormStage = (typeof FORM_STAGES)[number];
export const FORM_STAGE_LABEL: Record<FormStage, string> = { before: 'Safety checklist', after: 'Test sheet', incident: 'Incident report' };

export interface FormItem {
  key: string;
  label: string;
  kind: 'check' | 'text';
}

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_ITEMS = 30;

/** Items from the text typed by the manager, one per line ("=" first: a written answer). */
export function parseItems(text: string): Check<FormItem[]> {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: 'Type at least one item, one per line' };
  if (lines.length > MAX_ITEMS) return { ok: false, error: 'At most 30 items' };
  const items: FormItem[] = [];
  for (const [i, line] of lines.entries()) {
    const text = line.startsWith('=');
    const label = (text ? line.slice(1) : line).trim().slice(0, 200);
    if (label.length < 2) return { ok: false, error: 'Each item needs a label' };
    items.push({ key: `i${i + 1}`, label, kind: text ? 'text' : 'check' });
  }
  return { ok: true, value: items };
}

/** The text the manager edits, back from the items. */
export const itemsText = (items: readonly FormItem[]) => items.map((i) => (i.kind === 'text' ? `= ${i.label}` : i.label)).join('\n');

/** The answers of a filled form: every box ticked, every written answer given (500 characters at most). */
export function checkAnswers(items: readonly FormItem[], raw: Record<string, unknown>): Check<Record<string, string | boolean>> {
  const answers: Record<string, string | boolean> = {};
  for (const it of items) {
    const v = raw[it.key];
    if (it.kind === 'check') {
      if (v !== 'on' && v !== 'true' && v !== true) return { ok: false, error: `Tick every item · ${it.label}` };
      answers[it.key] = true;
    } else {
      const s = String(v ?? '').trim().slice(0, 500);
      if (!s) return { ok: false, error: `Answer every item · ${it.label}` };
      answers[it.key] = s;
    }
  }
  return { ok: true, value: answers };
}

/** Which forms a booking may receive now. */
export function stagesOpen(status: string): FormStage[] {
  if (status === 'confirmed') return ['before'];
  if (status === 'in_progress') return ['before', 'incident', 'after'];
  if (status === 'done') return ['after'];
  return [];
}
