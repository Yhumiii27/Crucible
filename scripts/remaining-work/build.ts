// Remaining-work inventory (copied from Keystone): renders docs/reste-a-developper.json (the source of truth) into
// docs/RESTE-A-DEVELOPPER.md and the self-contained HTML page published as the "Reste à développer Crucible" artifact.
//   npm run remaining:page [-- <html output path>]      (default: .artifacts/reste-a-developper.html, gitignored)
// After each development: set the items' `progress` ({ state: 'a_faire' | 'en_cours' | 'fait', delivery, note }), add a
// line to `history`, update `updated`, run this script, commit, then republish the HTML to the same artifact (CLAUDE.md).
import fs from 'node:fs';
import path from 'node:path';

type Priority = 'bloquant_production' | 'prochaine_etape' | 'a_decider' | 'plus_tard';
type Status = 'non_commence' | 'partiel' | 'bloque_attente_proprietaire' | 'bloque_systeme_externe';
type Progress = 'a_faire' | 'en_cours' | 'fait';
interface Item {
  id: string; title: string; description: string; category: string; kind: string; priority: Priority; status: Status;
  waiting_on: string; effort: 'S' | 'M' | 'L' | 'XL'; sources: string[]; evidence: string[];
  progress?: { state: Progress; delivery?: string; note?: string };
}
interface Inventory { generated: string; updated: string; branch: string; history: { date: string; text: string }[]; items: Item[] }

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'docs', 'reste-a-developper.json');
const MD = path.join(ROOT, 'docs', 'RESTE-A-DEVELOPPER.md');
const HTML = path.resolve(process.argv[2] ?? path.join(ROOT, '.artifacts', 'reste-a-developper.html'));
const TEMPLATE = path.join(__dirname, 'page.template.html');

const CAT: [string, string][] = [
  ['plateforme_production', 'Plateforme et mise en production'], ['droits_acces', 'Connexion, profils et visibilité'],
  ['moyens_regles', 'Moyens d’essais, règles et réservations'], ['besoins_anticipation', 'Besoins des projets et anticipation'],
  ['proposition_arbitrage', 'Proposition de créneaux et arbitrages'], ['aleas_pilotage', 'Aléas, scénarios et pilotage'],
  ['assistant_ia', 'Assistant IA'], ['liens_outils', 'Liens avec les autres outils'], ['cadrage_decisions', 'Cadrage, décisions et données attendues'],
];
const PRI: Record<Priority, string> = { bloquant_production: 'Bloquant production', prochaine_etape: 'Prochaine étape', a_decider: 'À décider', plus_tard: 'Plus tard' };
const PORD: Priority[] = ['bloquant_production', 'prochaine_etape', 'a_decider', 'plus_tard'];
const ST: Record<Status, string> = {
  non_commence: 'non commencé', partiel: 'partiel', bloque_attente_proprietaire: 'attend le responsable produit', bloque_systeme_externe: 'attend un système externe',
};
const PROG: Record<Progress, string> = { a_faire: 'à faire', en_cours: 'en cours', fait: 'fait' };
const DAYS = { S: 1.5, M: 4, L: 12, XL: 30 } as const;

const inv = JSON.parse(fs.readFileSync(SRC, 'utf8')) as Inventory;
const all = inv.items;
const progOf = (x: Item): Progress => x.progress?.state ?? 'a_faire';
const open = all.filter((x) => progOf(x) !== 'fait');
const byKey = (a: Item, b: Item) => PORD.indexOf(a.priority) - PORD.indexOf(b.priority) || a.id.localeCompare(b.id);
const days = (xs: Item[]) => Math.round(xs.reduce((s, x) => s + DAYS[x.effort], 0));
for (const x of all) if (!CAT.some(([c]) => c === x.category)) throw new Error(`${x.id}: unknown category ${x.category}`);

// ── Markdown ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const L: string[] = [];
const w = (s = '') => L.push(s);
const n = (p: Progress) => all.filter((x) => progOf(x) === p).length;
w('# Crucible — reste à développer');
w();
w(`Inventaire initial du ${inv.generated}, mis à jour le ${inv.updated} (branche \`${inv.branch}\`). Il recense ce qu'il reste à développer, à brancher, à décider ou à mettre en production pour Crucible, aligné sur le plan de livraisons (\`docs/PLAN.md\`). Il est tenu à jour à chaque développement : un point passe « en cours » quand une livraison le prend, « fait » quand il est intégré et vérifié. Le détail est dans \`docs/reste-a-developper.json\` ; ce document et la page sont produits par \`npm run remaining:page\`.`);
w();
w("**Lecture.** Priorité : Bloquant production, Prochaine étape, À décider (il faut d'abord trancher), Plus tard. Effort, pour un développeur qui connaît le code : S < 2 jours, M ≤ 1 semaine, L ≤ 3 semaines, XL > 3 semaines. Les identifiants entre parenthèses renvoient aux décisions (\`docs/DECISIONS.md\`) et aux demandes (\`docs/DEMANDES-*.md\`).");
w();
w('## 1. En bref');
w();
w(`**Avancement** : ${n('fait')} fait${n('fait') > 1 ? 's' : ''}, ${n('en_cours')} en cours, ${n('a_faire')} à faire, sur ${all.length} points.`);
w();
w('| Priorité | Points restants | Effort estimé (jours) |');
w('|---|---:|---:|');
for (const p of PORD) { const xs = open.filter((x) => x.priority === p); w(`| ${PRI[p]} | ${xs.length} | ≈ ${days(xs)} |`); }
w(`| **Total** | **${open.length}** | **≈ ${days(open)}** |`);
w();
w("L'effort est un ordre de grandeur (S = 1,5 j, M = 4 j, L = 12 j, XL = 30 j) : il ne compte ni l'attente des décisions et des données, ni les développements à faire côté Keystone, Codex, Vigie, Cursus ou Matrix, ni la recette.");
w();
w('| Statut (points restants) | Points |');
w('|---|---:|');
for (const s of Object.keys(ST) as Status[]) { const c = open.filter((x) => x.status === s).length; w(`| ${ST[s][0].toUpperCase()}${ST[s].slice(1)} | ${c} |`); }
w();
w('| Domaine | Bloquant production | Prochaine étape | À décider | Plus tard | Restants | Faits |');
w('|---|---:|---:|---:|---:|---:|---:|');
for (const [c, lab] of CAT) {
  const xs = open.filter((x) => x.category === c);
  const k = (p: Priority) => xs.filter((x) => x.priority === p).length;
  w(`| ${lab} | ${k('bloquant_production')} | ${k('prochaine_etape')} | ${k('a_decider')} | ${k('plus_tard')} | ${xs.length} | ${all.filter((x) => x.category === c && progOf(x) === 'fait').length} |`);
}
w();
w('### 1.1 Chemin critique vers la production');
w();
w('Les points « Bloquant production » restants, par domaine. Sans eux, Crucible reste une démonstration.');
w();
const tag = (x: Item) => (progOf(x) === 'en_cours' ? ` *(en cours${x.progress?.delivery ? ', ' + x.progress.delivery : ''})*` : '');
for (const [c, lab] of CAT) {
  const xs = open.filter((x) => x.category === c && x.priority === 'bloquant_production').sort(byKey);
  if (xs.length) w(`- **${lab}** : ${xs.map((x) => `${x.id} ${x.title}${tag(x)}`).join(' ; ')}.`);
}
w();
w('### 1.2 Ce qui attend le responsable produit');
w();
w('Décisions à prendre et données à fournir avant de pouvoir développer (`docs/DECISIONS.md`).');
w();
for (const x of open.filter((x) => x.priority === 'a_decider' || x.status === 'bloque_attente_proprietaire').sort((a, b) => a.id.localeCompare(b.id)))
  w(`- **${x.id}** ${x.title} — ${x.waiting_on || '—'}`);
w();
w('### 1.3 Ce qui attend les autres applications');
w();
for (const x of open.filter((x) => x.status === 'bloque_systeme_externe').sort((a, b) => a.id.localeCompare(b.id))) w(`- **${x.id}** ${x.title} — ${x.waiting_on || '—'}`);
w();
w('## 2. Liste détaillée par domaine');
w();
CAT.forEach(([c, lab], i) => {
  const xs = all.filter((x) => x.category === c).sort((a, b) => (progOf(a) === 'fait' ? 1 : 0) - (progOf(b) === 'fait' ? 1 : 0) || byKey(a, b));
  w(`### 2.${i + 1} ${lab} (${xs.filter((x) => progOf(x) !== 'fait').length} restants${xs.some((x) => progOf(x) === 'fait') ? `, ${xs.filter((x) => progOf(x) === 'fait').length} faits` : ''})`);
  w();
  for (const x of xs) {
    const pg = progOf(x);
    const head = pg === 'fait' ? `~~${x.id} · ${x.title}~~` : `${x.id} · ${x.title}`;
    const state = pg === 'a_faire' ? '' : ` · **${PROG[pg]}${x.progress?.delivery ? ` (${x.progress.delivery})` : ''}**`;
    w(`**${head}** — *${PRI[x.priority]} · ${ST[x.status]} · effort ${x.effort}*${state}  `);
    w(`${x.description}  `);
    const extra: string[] = [];
    if (x.progress?.note) extra.push(`Avancement : ${x.progress.note}`);
    if (x.waiting_on) extra.push(`Attend : ${x.waiting_on}`);
    if (x.sources.length) extra.push(`Sources : ${x.sources.join(', ')}`);
    if (extra.length) w(`*${extra.join(' · ').replace(/\*/g, '\\*')}*`);
    w();
  }
});
w('## 3. Mises à jour');
w();
for (const h of [...inv.history].reverse()) w(`- ${h.date} — ${h.text}`);
fs.writeFileSync(MD, L.join('\n').trimEnd() + '\n');

// ── HTML page ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const safe = (v: unknown) => JSON.stringify(v).replace(/<\//g, '<\\/');
const fr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const html = fs
  .readFileSync(TEMPLATE, 'utf8')
  .replace('__CAT__', safe(CAT))
  .replace('__DATA__', safe(all))
  .replace('__META__', safe({ history: inv.history.map((h) => ({ ...h, date: fr(h.date) })) }))
  .replace('__UPDATED__', fr(inv.updated))
  .replace('__BRANCH__', inv.branch);
fs.mkdirSync(path.dirname(HTML), { recursive: true });
fs.writeFileSync(HTML, html);
console.log(`${all.length} items (${n('fait')} done, ${n('en_cours')} in progress) → ${path.relative(ROOT, MD)}, ${path.relative(ROOT, HTML)}`);
