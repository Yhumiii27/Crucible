# Crucible — instructions for Claude sessions

Crucible is the group's application for **planning and arbitrating the shared R&D test resources**: laboratoire 67 (shared
with EPC France), PDE, laboratoire PDE, atelier mécanique, then the other test means. Sibling apps: Keystone (projects,
`Yhumiii27/Keystone`), Arche (subsidiaries' CAPEX — the model to follow), Codex (documents), Vigie (QHSE), Cursus (HR),
Matrix (shared PostgreSQL server). Their repositories can be added read-only to a session (never modified).

## Inter-repo rules (owner, 22 Oct 2026)

- This chat's own repository is `Yhumiii27/Crucible`; say so in the first reply of a session. Write, commit and push only here.
- `REQUESTS.md` (root) is Crucible's inbox: the other applications file their requests to Crucible there. At the start of each
  session, read it and report the OPEN entries to the owner; handle one only after the owner agrees.
- The only write allowed in another repository is adding an entry to its `REQUESTS.md` (or changing the status of an entry
  Crucible created there), and only after presenting the owner a detailed note (target repo, exact ask, why, what happens
  without it) and receiving an explicit « validé ». `docs/DEMANDES-<APP>.md` are Crucible's drafts of those requests.

## Where the project stands

- **Delivery 0 (framing) is done** (22 Oct 2026): `docs/ANALYSE.md` (need analysis, feasibility, survey of the sibling
  repos, data needed, risks), `docs/spec/00`–`05`, `docs/DECISIONS.md`, `docs/PLAN.md`, `docs/ATELIER-CADRAGE.md` (first
  workshop with the teams), `docs/DEMANDES-*.md`.
- **Delivery 1 (platform) is done** (`docs/DELIVERY-1.md`, `docs/SOCLE.md`): platform copied from Arche `18c4686` (itself
  from Keystone `63f43ad`), PostgreSQL only, 9 profiles with global / entity / facility / project scopes, visibility filtered in
  SQL (`src/domain/rights.ts`, `src/server/dal/visibility.ts`: a partner sees the facilities shared with its entity and its own
  projects; a confidential project stays with its team and the R&D director), administration of accounts, roles, entities,
  sites, facilities and projects, demo data set (laboratoire 67 shared with EPC France, PDE).
- **Delivery 2 (resources, rules, bookings, utilisation) is done** (`docs/DELIVERY-2.md`): resources and calendars
  (`src/domain/calendar.ts`, `resources.ts`), exclusion rules validated by the safety officer, agreements, bookings checked
  against every hard constraint (`src/domain/booking.ts` `checkBooking`, Server Functions `src/features/resources/actions.ts`
  re-check inside their transaction under the write lock), week grid (`planning-grid.ts`), utilisation computed, never stored
  (`utilisation.ts`), history import. Screens `/planning`, `/facilities/[code]`, `/rules`, `/my/schedule`, `/dashboard`.
- **Delivery 3 (needs and anticipation) is done** (`docs/DELIVERY-3.md`): milestones entered in Crucible until Keystone
  publishes `pub_jalons` (K-2), test type catalogue, test needs (forecast / request, `N-AAAA-NNNN`, due on their milestone by
  default; `src/domain/needs.ts`, `src/features/needs/actions.ts`, who enters them: `canManageNeeds`, F-13), notice of 10
  working days for every entity (F-5), load forecast computed per resource, per validated rule and per week over 26 weeks then
  by quarter to 12 months (`src/domain/load.ts`, `src/server/dal/needs.ts`; bottlenecks > 100 %, gaps < 30 %, F-11, F-12),
  Codex references of protocols and reports, views `pub_moyens` and `pub_reservations` (`drizzle/0005_share_resources.sql`;
  confidential projects masked, S-7), connectors screen (`src/config/connectors.ts`). Screens `/my/needs`, `/projects/[code]`,
  `/load`, `/admin/connectors`.
- **Delivery 4 (proposal and arbitration) is done** (`docs/DELIVERY-4.md`): people, skills (read from Cursus when granted) and
  absences (`src/domain/people.ts`, `/people`), test type requirements, mobile equipment, substitutions validated by the host
  facility and safety (R-4, R-11), versioned priority rules (`src/domain/priority.ts`), deterministic engine that only proposes
  (`src/domain/engine.ts`, run and storage `src/server/planning/engine-run.ts`, daily job `plan-nightly`), proposals accepted by
  a facility manager after every check again, conflict sheets with options, rule cited and recommendation
  (`src/domain/conflicts.ts`), append-only arbitrations, safety veto. Screens `/propose`, `/conflicts`, `/people`.
- **PDE (owner's answer P-2)**: one building split into zones — mechanical workshop, pilot, laboratory rooms — where only one
  zone works at a time (no pyrotechnic co-activity): three resources linked by the validated rule `PDE-ONE-ZONE`.
- **Owner's answers**: questionnaire "Décisions Crucible", https://claude.ai/artifact/EaWUrHKrsdaWGB1UHtL1Ym — read its
  database (ArtifactData, collection `answers`, one document per question id: `choice` = default | altN | other | discuss,
  `note`) before each delivery and apply the answers to `docs/DECISIONS.md`; keep `scripts/questionnaire/questions.json` in
  step with it and rebuild the page with `npm run questionnaire:page`. 22 Oct 2026: 56 defaults confirmed, P-2 answered
  (above); the data D-1 to D-11 are still to come. Delivery 2 added F-10, R-10, P-7, delivery 3 F-11, F-12, F-13, S-7,
  delivery 4 R-11, A-9, F-14 (defaults applied).
- **Remaining-work page**: after every development, update `docs/reste-a-developper.json` (`progress`, `history`, `updated`),
  run `npm run remaining:page` (regenerates `docs/RESTE-A-DEVELOPPER.md` and `.artifacts/reste-a-developper.html`), commit,
  and republish the HTML with the Artifact tool to the same page, https://claude.ai/artifact/RaDZti7t97J9UvTxfCXUuW (pass it
  as `url`).
- **Requests sent to other repos** (22 Oct 2026, validated by the owner): Keystone K-2 `pub_jalons` (Keystone#22, merged),
  Cursus CU-1 `pub_absences` (Cursus#15, merged), Vigie V-1 `pub_controles` (Vigie#12), Matrix M-7 (copy `pub_moyens`,
  `pub_reservations` into `partage/80-crucible.sql`, Matrix#17).
- Next: delivery 5 (incidents and recovery scenarios, before / after per project, what-if simulations, urgencies, notifications,
  weekly snapshots), see `docs/PLAN.md`.

## Rules (same as Arche; confirmed by the owner's answers of 22 Oct 2026)

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

## Setup and checks

```bash
npm ci && npm run db:local && npm run db:migrate   # .env.local: see .env.example (PostgreSQL only)
npx next typegen && npm run typecheck && npm run lint && npm test
npm run dev                                         # http://localhost:3500
```
