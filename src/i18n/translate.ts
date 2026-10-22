// Translation engine (derived from Keystone's src/i18n/translate.ts). UI strings are authored in English and rendered in
// French through the dictionaries of ./fr/*.json (exact match), then the parameterised FR_RULES, then segment by segment on
// " · ", " — ", " → ", " / ". French is the default language. Text people typed never goes through t() (./data-text.ts).
import { FR_DICT } from './fr';
import { FR_RULES } from './fr-rules';

export type Lang = 'fr' | 'en';
export const LANGS: Lang[] = ['fr', 'en'];
export const DEFAULT_LANG: Lang = 'fr';

/** Exact FR dictionary entry of an English string, else undefined. */
export const frExact = (s: string): string | undefined => (s && Object.hasOwn(FR_DICT, s) ? FR_DICT[s] : undefined);

function frSeg(s: string): string {
  const exact = frExact(s);
  if (exact != null) return exact;
  for (const [re, rep] of FR_RULES) if (re.test(s)) return s.replace(re, rep);
  return s;
}

export function trFR(s: string): string {
  if (!s) return s;
  const exact = frExact(s);
  if (exact != null) return exact;
  if (/^[\s\d.,%€$+−–\-]*$/.test(s)) return s;
  const parts = s.split(/( · | — | → | \/ )/);
  if (parts.length > 1) return parts.map((p, i) => (i % 2 ? p : frSeg(p))).join('');
  return frSeg(s);
}

export type T = (english: string) => string;

/** Returns the translator for a language. English is the identity. */
export function makeT(lang: Lang): T {
  return lang === 'fr' ? trFR : (s) => s;
}

/** Locale used by Intl formatters. */
export const intlLocale = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-GB');
