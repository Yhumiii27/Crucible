// What a question asks when no AI provider answers (spec 04 §3, "repli sans IA": explanations by rule-based templates). The
// templates do not understand free text: they recognise a reference (need N-…, conflict C-…), a code of the catalogue (resource,
// test type, facility), dates, and a few words, and pick the lookup that answers. Anything else gets the list of what can be
// asked, with examples. Pure.
import { addDaysIso, dowOfIso } from '@/lib/dates';
import { isIsoDate } from './clock';

export type Intent =
  | { kind: 'need'; ref: string }
  | { kind: 'conflict'; ref: string }
  | { kind: 'alternatives'; testType: string | null; resource: string | null; fromOn: string; toOn: string }
  | { kind: 'risks'; facility: string | null; quarter: string | null }
  | { kind: 'simulate'; resource: string; fromOn: string; toOn: string }
  | { kind: 'prepare' }
  | { kind: 'help' };

export interface Catalogue {
  resources: readonly string[];
  testTypes: readonly string[];
  facilities: readonly string[];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The codes of a list found in the text as whole words (a code may hold dashes: "PDE-PIL"), longest first. */
function codesIn(text: string, codes: readonly string[]): string[] {
  const up = text.toUpperCase();
  const found: string[] = [];
  for (const c of [...codes].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^A-Z0-9-])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Z0-9-])`);
    if (re.test(up) && !found.some((f) => f.includes(c))) found.push(c);
  }
  return found;
}

/** Dates written in the question: 2026-11-03, 03/11/2026, 3/11 (the year of `today`, or the next one when already past). */
export function datesIn(text: string, today: string): string[] {
  const out: string[] = [];
  const re = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  for (const m of text.matchAll(re)) {
    let iso: string;
    if (m[1]) iso = `${m[1]}-${m[2]}-${m[3]}`;
    else {
      const y = m[6] ? (m[6].length === 2 ? `20${m[6]}` : m[6]) : today.slice(0, 4);
      iso = `${y}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`;
      if (!m[6] && iso < today) iso = `${Number(y) + 1}${iso.slice(4)}`;
    }
    if (isIsoDate(iso)) out.push(iso);
  }
  return out;
}

const mondayAfter = (iso: string) => addDaysIso(iso, ((8 - dowOfIso(iso)) % 7) || 7);

/** The working days asked: dates written, else "this week" (from tomorrow) or "next week" (default for a simulation). */
function windowIn(t: string, text: string, today: string, fallback: 'this' | 'next'): { fromOn: string; toOn: string } {
  const d = datesIn(text, today);
  if (d.length) return { fromOn: d[0], toOn: d[1] && d[1] >= d[0] ? d[1] : d[0] };
  const next = /semaine prochaine|next week/.test(t) || (fallback === 'next' && !/cette semaine|this week/.test(t));
  if (next) {
    const mon = mondayAfter(today);
    return { fromOn: mon, toOn: addDaysIso(mon, 4) };
  }
  const tomorrow = addDaysIso(today, 1);
  const friday = addDaysIso(today, (5 - dowOfIso(today) + 7) % 7);
  return friday >= tomorrow ? { fromOn: tomorrow, toOn: friday } : { fromOn: mondayAfter(today), toOn: addDaysIso(mondayAfter(today), 4) };
}

const ORDINAL: Record<string, number> = { premier: 1, '1er': 1, first: 1, deuxieme: 2, second: 2, troisieme: 3, third: 3, quatrieme: 4, fourth: 4 };

/** "2027-T1" from "T1 2027", "Q1", "premier trimestre"…: the year given, else the next quarter of that number. */
export function quarterIn(text: string, today: string): string | null {
  const t = fold(text);
  let n: number | null = null;
  const m = /\b[tq]([1-4])\b/.exec(t);
  if (m) n = Number(m[1]);
  else {
    const w = /\b(premier|1er|first|deuxieme|second|troisieme|third|quatrieme|fourth)\s+(trimestre|quarter)\b/.exec(t);
    if (w) n = ORDINAL[w[1]];
  }
  if (!n) return null;
  const y = /\b(20\d{2})\b/.exec(t)?.[1];
  const year = Number(today.slice(0, 4));
  const current = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  return `${y ?? (n < current ? year + 1 : year)}-T${n}`;
}

export function parseQuestion(question: string, cat: Catalogue, today: string): Intent {
  const t = fold(question);
  const conflict = /\bC-\d{4}-\d{4}\b/i.exec(question)?.[0];
  if (conflict) return { kind: 'conflict', ref: conflict.toUpperCase() };
  const need = /\bN-\d{4}-\d{4}\b/i.exec(question)?.[0];
  if (need) return { kind: 'need', ref: need.toUpperCase() };
  const resources = codesIn(question, cat.resources);
  const types = codesIn(question, cat.testTypes);
  const facilities = codesIn(question, cat.facilities).filter((f) => !resources.some((r) => r.startsWith(`${f}-`)));
  if (/\bet si\b|what if|simul|\bsi\b.*\b(panne|ferme|fermee|indisponible|arret)/.test(t) && resources.length) {
    const w = windowIn(t, question, today, 'next');
    return { kind: 'simulate', resource: resources[0], ...w };
  }
  if (/\bou\b.*\b(faire|passer|realiser|lancer)|\bwhere\b|alternati|substitu|autre moyen|ailleurs|other resource/.test(t) && (types.length || resources.length)) {
    return { kind: 'alternatives', testType: types[0] ?? null, resource: types.length ? null : resources[0] ?? null, ...windowIn(t, question, today, 'this') };
  }
  if (/risque|manqu|goulot|sature|anticip|plan de charge|\bcharge\b|bottleneck|risk|short of|\bload\b/.test(t))
    return { kind: 'risks', facility: facilities[0] ?? null, quarter: quarterIn(question, today) };
  if (/besoin|declarer|demander|\bneed|request|(essai|tir|test|mesure|firing|trial|run)s?\b.*\b(a faire|a mener|to do|to run|to carry out)|\bjalon|milestone/.test(t)) return { kind: 'prepare' };
  return { kind: 'help' };
}
