// French completeness (Keystone rule R-184): every English source string Crucible passes to t() as a literal has its French.
// The scan reads src for t('…') / t("…") literals and t(`…`) templates, outside comments and tests. In a template each ${…}
// stands for a value: every quoted option of a choice gives a string to check, else "2". A string passes when it has an exact
// French entry that differs from the English (./fr/*.json), or the first FR_RULES rule that matches changes it, or every
// " · ", " — ", " → ", " / " segment passes on its own, or it is on the reviewed list of strings that read the same in French
// (./same-in-french.json). And each English key has one French translation across the dictionary files.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import SAME from './same-in-french.json';
import { FR_FILES } from './fr';
import { FR_RULES } from './fr-rules';
import { frExact } from './translate';

const SRC = path.join(process.cwd(), 'src');
const EXCLUDED_DIRS = new Set([path.join(SRC, 'test')]);
const isSource = (f: string) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.d.ts');

function walk(dir: string, out: string[] = []): string[] {
  if (EXCLUDED_DIRS.has(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (isSource(p)) out.push(p);
  }
  return out;
}

const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const unescape = (s: string) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');

const PLACEHOLDER = /\$\{((?:[^{}]|\{[^{}]*\})*)\}/;
function instantiate(raw: string): string[] {
  const m = PLACEHOLDER.exec(raw);
  if (!m) return [raw];
  const before = raw.slice(0, m.index);
  const after = raw.slice(m.index + m[0].length);
  const choice = /\?\s*(['"])/.test(m[1]) ? [...m[1].matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)].map((x) => x[2]) : null;
  const values = choice ?? ['2'];
  return values.flatMap((v) => instantiate(after).map((rest) => before + v + rest)).slice(0, 16);
}

function scanLiterals(files: readonly string[]): { text: string; file: string }[] {
  const found: { text: string; file: string }[] = [];
  const quoted = /(?<![\w$.])t\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1\s*[,)]/g;
  const template = /(?<![\w$.])t\(\s*`((?:\\.|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\$]|\$(?!\{))*)`\s*[,)]/g;
  for (const file of files) {
    const src = withoutComments(fs.readFileSync(file, 'utf8'));
    for (const m of src.matchAll(quoted)) found.push({ text: unescape(m[2]), file });
    for (const m of src.matchAll(template)) for (const text of instantiate(m[1])) found.push({ text: unescape(text), file });
  }
  return found;
}

const SAME_SET = new Set<string>(SAME.strings);
const FORMATTED = /^[\d\s+\-−–→.,:;%€$/()×#~≈<>=≥≤]*$/;
const SEPARATORS = / · | — | → | \/ /;

function passes(s: string): boolean {
  if (FORMATTED.test(s) || SAME_SET.has(s)) return true;
  const fr = frExact(s);
  if (fr !== undefined) return fr !== s;
  for (const [re, rep] of FR_RULES) if (re.test(s)) return s.replace(re, rep) !== s || SAME_SET.has(s.replace(/\d+/g, '').trim());
  if (SEPARATORS.test(s)) return s.split(SEPARATORS).every((p) => passes(p.trim()));
  return false;
}

describe('French completeness', () => {
  const literals = scanLiterals(walk(SRC));

  it('the scan finds the t() literals', () => {
    expect(literals.length).toBeGreaterThan(20);
  });

  it('every t() literal has its French', () => {
    const missing = [...new Set(literals.filter((l) => !passes(l.text)).map((l) => `${path.relative(SRC, l.file)}: ${l.text}`))];
    expect(missing).toEqual([]);
  });

  it('one French translation per key across the dictionaries; no entry equal to its English', () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const [file, dict] of Object.entries(FR_FILES))
      for (const [en, fr] of Object.entries(dict)) {
        if (fr === en) conflicts.push(`${file}: "${en}" is not translated`);
        const prev = seen.get(en);
        if (prev !== undefined && prev !== fr) conflicts.push(`${file}: "${en}" → "${fr}" / "${prev}"`);
        seen.set(en, fr);
      }
    expect(conflicts).toEqual([]);
  });
});
