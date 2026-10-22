// Import of past bookings (F-9, X-2: the reference measure of the utilisation). Pure parser of lines pasted from a spreadsheet,
// separated by ";" or tabs:
//   resource code ; project code ; start ; end ; actual start ; actual end ; purpose
// Dates and times "YYYY-MM-DD HH:MM" (Paris). Empty actual times: the test ran as booked; "absent" in the actual start: not
// held. Every line ends before today. A header line starting with "resource" is skipped.
import { isIsoDate } from './clock';
import { isHhmm } from './calendar';
import { parisInstant } from '@/lib/dates';

export interface HistoryLine {
  resourceCode: string;
  projectCode: string;
  startOn: string;
  start: Date;
  end: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  status: 'done' | 'no_show';
  title: string;
}

const MAX_LINES = 2000;

function instant(v: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec(v.trim());
  return m && isIsoDate(m[1]) && isHhmm(m[2]) ? parisInstant(m[1], m[2]) : null;
}

export function parseHistory(text: string, ctx: { resources: ReadonlySet<string>; projects: ReadonlySet<string>; today: string }):
  { ok: true; value: HistoryLine[] } | { ok: false; error: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^resource/i.test(l));
  if (!lines.length) return { ok: false, error: 'Paste at least one line' };
  if (lines.length > MAX_LINES) return { ok: false, error: 'At most 2000 lines at a time' };
  const todayStart = parisInstant(ctx.today, '00:00');
  const out: HistoryLine[] = [];
  for (const [i, line] of lines.entries()) {
    const at = `Line ${i + 1}`;
    const c = line.split(/;|\t/).map((x) => x.trim());
    if (c.length < 7) return { ok: false, error: `${at} · 7 columns expected` };
    const [resourceCode, projectCode, s, e, as, ae, ...rest] = c;
    const title = rest.join(' ').trim();
    if (!ctx.resources.has(resourceCode.toUpperCase())) return { ok: false, error: `${at} · Unknown resource` };
    if (!ctx.projects.has(projectCode.toUpperCase())) return { ok: false, error: `${at} · Unknown project` };
    const start = instant(s);
    const end = instant(e);
    if (!start || !end || end <= start) return { ok: false, error: `${at} · Invalid start or end` };
    if (end > todayStart) return { ok: false, error: `${at} · Only past bookings are imported` };
    if (title.length < 3) return { ok: false, error: `${at} · Describe the test` };
    const absent = /^(absent|no.?show)$/i.test(as);
    const actualStart = absent ? null : as ? instant(as) : start;
    const actualEnd = absent ? null : ae ? instant(ae) : end;
    if (!absent && (!actualStart || !actualEnd || actualEnd <= actualStart)) return { ok: false, error: `${at} · Invalid actual times` };
    out.push({
      resourceCode: resourceCode.toUpperCase(), projectCode: projectCode.toUpperCase(), startOn: s.slice(0, 10), start, end, actualStart, actualEnd,
      status: absent ? 'no_show' : 'done', title: title.slice(0, 200),
    });
  }
  return { ok: true, value: out };
}
