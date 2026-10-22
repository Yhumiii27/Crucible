# Crucible — instructions for Claude sessions

Crucible is the group's application for **planning and arbitrating the shared R&D test resources**: laboratoire 67 (shared
with EPC France), PDE, laboratoire PDE, atelier mécanique, then the other test means. Sibling apps: Keystone (projects,
`Yhumiii27/Keystone`), Arche (subsidiaries' CAPEX — the model to follow), Codex (documents), Vigie (QHSE), Cursus (HR),
Matrix (shared PostgreSQL server). Their repositories can be added read-only to a session (never modified); requests to them
go in `docs/DEMANDES-<APP>.md`.

## Where the project stands

- **Delivery 0 (framing) is done** (22 Oct 2026): `docs/ANALYSE.md` (need analysis, feasibility, survey of the sibling
  repos, data needed, risks), `docs/spec/00`–`05`, `docs/DECISIONS.md`, `docs/PLAN.md`, `docs/ATELIER-CADRAGE.md` (first
  workshop with the teams), `docs/DEMANDES-*.md`. Nothing is coded before the owner's answers.
- **Owner's answers**: questionnaire "Décisions Crucible", https://claude.ai/artifact/EaWUrHKrsdaWGB1UHtL1Ym — read its
  database (ArtifactData, collection `answers`, one document per question id: `choice` = default | altN | other | discuss,
  `note`) before each delivery and apply the answers to `docs/DECISIONS.md`; keep `scripts/questionnaire/questions.json` in
  step with it and rebuild the page with `npm run questionnaire:page`.
- Next: delivery 1 (platform), see `docs/PLAN.md`.

## Rules (proposed, same as Arche — confirm with the owner's answers)

- Reply in **French**. Code, identifiers and commit messages in English. UI strings are English source strings translated
  through `src/i18n`; French is the default language.
- **Never modify the sibling repositories** (Keystone, Arche, Matrix, Codex, Vigie, Cursus).
- Nothing outside the owner's request without approval (additions are the X-n questions of `DECISIONS.md`).
- **The engine proposes, a person decides**: no confirmed booking moves without a traced human decision; the AI assistant
  never writes on its own and never proposes an unvalidated substitution or touches a safety rule.
- Crucible writes only in its schema (`crucible`, role `crucible_app`, T-1) and reads other tools only through their
  `pub_` views. Its own `pub_` views are contracts: never drop or rename a column; new columns go at the end.
- Copy only the **platform** (T-4: as adapted by Arche, origin commits recorded in `docs/SOCLE.md`), never business modules.
- Pure rules (calendars, hard constraints, conflicts, load, engine) live in `src/domain/` with value tests; indicators are
  computed, never stored; one business clock.
- Typed text is displayed as typed (never through `t()`); the audit trail is append-only; every Server Function validates
  input and rights server-side; migrations are generated, never edited.
- Every verified lot goes to `main` through a PR merged once CI is green.
- Ports on the owner's Mac (T-2 proposal): **3500** (Crucible) and **3510** (tests). Never use or kill 3000, 3100, 3110,
  3200, 3210, 3217, 3310, 3400, 3410, 5173.
