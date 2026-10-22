// Text people typed in Crucible or that another application sent (facility and project names, comments…) is shown exactly as typed in
// both languages: it never goes through `t()`, which is for Crucible's own vocabulary (Keystone rule R-148). The demonstration
// data set is written in English; a seeded string with an entry of its own in the FR dictionaries is shown in French so the
// demo reads naturally. A partial match never applies.
import { frExact, type Lang } from './translate';

/** Typed / received text in the viewer's language: as typed, or the exact FR dictionary entry of a seeded string. */
export function dataText(s: string, lang: Lang): string;
export function dataText(s: string | null | undefined, lang: Lang): string | null | undefined;
export function dataText(s: string | null | undefined, lang: Lang): string | null | undefined {
  if (lang !== 'fr' || !s) return s;
  return frExact(s) ?? s;
}
