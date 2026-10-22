// Product owner's questionnaire: renders ./questions.json (kept in step with docs/DECISIONS.md) into the self-contained page
// published as the "Décisions Crucible" artifact. Answers live in the artifact's database (collection `answers`, one
// document per question id: { choice, note, updatedAt }), read back with the ArtifactData tool.
//   node scripts/questionnaire/build.mjs [<html output path>]   (default: .artifacts/decisions-crucible.html, gitignored)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, '.artifacts', 'decisions-crucible.html'));
const questions = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));
const ids = new Set();
for (const q of questions) {
  if (ids.has(q.id)) throw new Error(`duplicate question ${q.id}`);
  ids.add(q.id);
}
const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
const html = fs
  .readFileSync(path.join(here, 'page.template.html'), 'utf8')
  .replace('__QUESTIONS__', JSON.stringify(questions).replace(/<\//g, '<\\/'))
  .replace('__UPDATED__', `mis à jour le ${today}`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`${questions.length} questions → ${path.relative(ROOT, OUT)}`);
