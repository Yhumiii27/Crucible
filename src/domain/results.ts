// Results of the tests (CR-081, X-18): what is recorded for a booking once its test has started — a conclusion, the measurements
// typed one per line, observations, and the references of the documents. Codex hosts every document (owner, 22 Oct 2026):
// Crucible keeps the Codex references of the raw data and of the lab notebook (the report stays `bookings.codex_ref`) and, when
// the team keeps an electronic lab notebook (ELN), the address of its entry — never a file. A result is kept as recorded: a
// correction is a new version with its reason (append-only). Pure: no import.

export const RESULT_OUTCOMES = ['pass', 'fail', 'retest', 'inconclusive'] as const;
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];

/** EN source strings. */
export const RESULT_OUTCOME_LABEL: Record<ResultOutcome, string> = {
  pass: 'Compliant',
  fail: 'Not compliant',
  retest: 'To be redone',
  inconclusive: 'No conclusion',
};

export const RESULT_OUTCOME_TONE: Record<ResultOutcome, 'accent' | 'outline' | 'neutral'> = {
  pass: 'outline', fail: 'accent', retest: 'accent', inconclusive: 'neutral',
};

export const isResultOutcome = (v: unknown): v is ResultOutcome => typeof v === 'string' && (RESULT_OUTCOMES as readonly string[]).includes(v);

export interface Measurement {
  name: string;
  value: string;
  unit: string;
}

export const MAX_MEASUREMENTS = 50;

/**
 * Measurements typed one per line, "name = value unit" or "name; value; unit" (unit optional): e.g. "Pression max = 212 bar",
 * "Durée; 4,2; s". Blank lines are skipped. Returns the line in error (1-based) when one cannot be read.
 */
export function parseMeasurements(text: string): { ok: true; value: Measurement[] } | { ok: false; error: string; line: number } {
  const out: Measurement[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    let name: string;
    let rest: string;
    let unit = '';
    let value: string;
    if (raw.includes(';')) {
      const parts = raw.split(';').map((s) => s.trim());
      if (parts.length < 2 || parts.length > 3) return { ok: false, error: 'A measurement is "name = value unit" or "name; value; unit"', line: i + 1 };
      [name, value, unit = ''] = parts;
    } else {
      const eq = raw.indexOf('=');
      if (eq < 0) return { ok: false, error: 'A measurement is "name = value unit" or "name; value; unit"', line: i + 1 };
      name = raw.slice(0, eq).trim();
      rest = raw.slice(eq + 1).trim();
      // The unit is what follows the first number, when the value starts with one ("212 bar", "-4,5 °C", "1.2e3 Pa").
      const m = /^([-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?)\s*(.*)$/.exec(rest);
      if (m) {
        value = m[1];
        unit = m[2].trim();
      } else {
        value = rest;
      }
    }
    if (!name || !value) return { ok: false, error: 'A measurement needs a name and a value', line: i + 1 };
    if (name.length > 80 || value.length > 80 || unit.length > 20) return { ok: false, error: 'A measurement is too long (name and value 80 characters, unit 20)', line: i + 1 };
    out.push({ name, value, unit });
  }
  if (out.length > MAX_MEASUREMENTS) return { ok: false, error: `${MAX_MEASUREMENTS} measurements at most`, line: lines.length };
  return { ok: true, value: out };
}

/** Measurements as typed back in the form (to correct a result). */
export const measurementsText = (ms: readonly Measurement[]) => ms.map((m) => `${m.name} = ${m.value}${m.unit ? ` ${m.unit}` : ''}`).join('\n');

/** A Codex reference as Crucible keeps it: 2 to 60 characters, no line break; empty = none. */
function codexRef(v: unknown): string | null | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  return s.length >= 2 && s.length <= 60 && !/[\r\n]/.test(s) ? s : undefined;
}

/** The address of an ELN entry: http or https, without credentials, 500 characters at most; empty = none. */
export function elnAddress(v: unknown): string | null | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  if (s.length > 500) return undefined;
  try {
    const u = new URL(s);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

export interface ResultInput {
  outcome: ResultOutcome;
  measurements: Measurement[];
  observations: string | null;
  rawDataRef: string | null;
  notebookRef: string | null;
  elnUrl: string | null;
  /** Why a recorded result is corrected (required from the second version). */
  reason: string | null;
}

/** A result as entered; `correcting` = a result is already recorded for the booking. */
export function checkResult(raw: Record<string, unknown>, correcting: boolean): { ok: true; value: ResultInput } | { ok: false; error: string } {
  if (!isResultOutcome(raw.outcome)) return { ok: false, error: 'Choose the conclusion of the test' };
  const ms = parseMeasurements(typeof raw.measurements === 'string' ? raw.measurements : '');
  if (!ms.ok) return { ok: false, error: `${ms.error} (line ${ms.line})` };
  const observations = typeof raw.observations === 'string' && raw.observations.trim() ? raw.observations.trim() : null;
  if (observations && observations.length > 4000) return { ok: false, error: 'The observations are too long (4,000 characters at most)' };
  const rawDataRef = codexRef(raw.rawDataRef);
  const notebookRef = codexRef(raw.notebookRef);
  if (rawDataRef === undefined || notebookRef === undefined) return { ok: false, error: 'A Codex reference has 2 to 60 characters' };
  const elnUrl = elnAddress(raw.elnUrl);
  if (elnUrl === undefined) return { ok: false, error: 'The ELN address must be an http or https address' };
  const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim().slice(0, 500) : null;
  if (correcting && !reason) return { ok: false, error: 'Say why the result is corrected' };
  if (!ms.value.length && !observations) return { ok: false, error: 'Enter at least one measurement or an observation' };
  return { ok: true, value: { outcome: raw.outcome, measurements: ms.value, observations, rawDataRef, notebookRef, elnUrl, reason: correcting ? reason : null } };
}

/** Bookings whose result can be recorded: a test started or done. */
export const canHaveResult = (status: string) => status === 'in_progress' || status === 'done';
