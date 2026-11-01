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
  delivery 4 R-11, A-9, F-14, delivery 5 P-8, P-9, A-10, F-15, delivery 6 I-5, I-6 (confirmed 23 Oct 2026), pilot P-10, X-7 (defaults applied).
- **Remaining-work page**: after every development, update `docs/reste-a-developper.json` (`progress`, `history`, `updated`),
  run `npm run remaining:page` (regenerates `docs/RESTE-A-DEVELOPPER.md` and `.artifacts/reste-a-developper.html`), commit,
  and republish the HTML with the Artifact tool to the same page, https://claude.ai/artifact/RaDZti7t97J9UvTxfCXUuW (pass it
  as `url`).
- **Requests sent to other repos** (22 Oct 2026, validated by the owner): Keystone K-2 `pub_jalons` (Keystone#22, merged),
  Cursus CU-1 `pub_absences` (Cursus#15, merged), Vigie V-1 `pub_controles` (Vigie#12), Matrix M-7 (copy `pub_moyens`,
  `pub_reservations` into `partage/80-crucible.sql`, Matrix#17); Matrix M-8 (copy `pub_occupation_hebdo`, grant to
  `matrix_app`), validated 23 Oct 2026, added to the same PR Matrix#17 (merged 23 Oct 2026).
- **Delivery 5 (incidents, scenarios, full steering) is done** (`docs/DELIVERY-5.md`): incidents (breakdown → unavailability,
  absence; `AL-AAAA-NNNN`) and their recovery scenario computed at once (`src/domain/recovery.ts`, `src/server/planning/scenarios.ts`:
  only the confirmed bookings touched move; before / after per project), accepted by the coordinator of every facility touched or
  the R&D director (every move checked again, A-10), what-if simulations (never applied), urgencies (A-8: displaced bookings go
  after the urgent test), notifications — bell and e-mail by the worker (`src/server/notify/`, `CRUCIBLE_MAIL_TRANSPORT`, F-15),
  arbitration reminders, weekly recap —, weekly snapshots kept once per completed week (`snapshots.ts`, view
  `pub_occupation_hebdo`), value of the unused capacity (facility acquisition cost, P-8) and delays due to the resources (P-9) on
  `/dashboard`. Screens `/incidents`, `/notifications`.
- **Delivery 5b (interface faithful to Keystone) is done** (`docs/DELIVERY-5b.md`, mockups validated 23 Oct 2026,
  https://claude.ai/artifact/NCPJzxcCPuXWFxPL36CvJS; X-5, X-6): menu by theme with ⌘K page search and counts, a Facility section
  with the facility switcher and the sheet's tabs (`src/config/facility-tabs.ts`), Keystone's page header (`header-tools.tsx`:
  global search `src/server/actions/search.ts` under U-3, bell, status date, FR/EN, CSV export `src/app/api/export/[screen]`),
  every form in a side panel (`Folded` of `ActionForm.tsx`), "To decide" (`/my/decisions`, `src/server/dal/decisions.ts`), load
  heat map (`src/features/load/`). New screens follow the same layout: page actions as `PageHeader primary`, filters and period
  navigation as `toolbar` (`PeriodNav`, `Segmented` with `href`), no form shown open in a page.
- **Delivery 6 (AI assistant) is done** (`docs/DELIVERY-6.md`; I-1 to I-4 applied, I-5 and I-6 added): a conversation panel on every
  screen (`src/features/assistant/panel.tsx`, mounted once in the app layout; "Why?" / "Explain" shortcuts on proposals and
  conflicts). It reads with the asker's rights through the lookups of `src/server/assistant/facts.ts` (engine trace `traceNeed`
  in `src/domain/engine.ts`, conflict sheet, validated alternatives, load risks, what-if built and dropped, need draft checked
  like the form) and writes nothing in the planning: a need draft opens the needs form (`/my/needs?draft=`), arbitration minutes
  open the decision (`/conflicts?turn=`), and the person's write cites the exchange in the audit trail (`citationOf`). Without a
  provider (default) rule-based templates answer (`src/server/assistant/local.ts`, `src/domain/assistant-intents.ts`); Claude
  (`src/server/assistant/claude.ts`) only with `CRUCIBLE_AI=claude` and `ANTHROPIC_API_KEY`, once the IT department has validated
  the provider (I-3); the `external` audience never names a confidential project (I-4). Exchanges are append-only
  (`assistant_conversations`, `assistant_turns`); Claude's messages are resent verbatim on the next turns. Never give the
  assistant a tool that writes.
- **Pilot prepared** (23 Oct 2026, `docs/PILOTE.md`; P-10, X-7 added; I-5, I-6 confirmed): screen `/pilot` (`src/domain/pilot.ts`,
  `src/server/dal/pilot.ts`, `src/features/pilot/`): the R&D director sets the first day, length and facilities (app_settings
  `crucible.pilot`, audited), a checklist of the start computed from what is recorded, and the reference measure (weeks before
  the start, from the imported history) compared with the pilot so far (X-2; usage shared with the dashboard through
  `resourceUsages`). The start waits on outside prerequisites: the workshop and the data D-1 to D-11, hosting (T-6), the Entra
  registration, M-6 (Matrix). Claude's activation waits on the IT department (I-3).
- **Delivery 7 (measured occupancy, Outlook / Teams calendars) is done** (`docs/DELIVERY-7.md`; CR-071 and CR-072 of the
  comparative analysis, X-8 and X-9 added): occupancy devices (kiosk `/kiosk/<token>`, `POST /api/occupancy` with a Bearer
  device token for a bench agent, an interlock or a badge reader; `src/domain/occupancy.ts` matches each start / stop to the
  booking of the resource, else a use without a booking, never counted; events append-only; facility tab "measurement"); real
  e-mail (`CRUCIBLE_MAIL_TRANSPORT` smtp | graph, `src/server/notify/mail.ts`, nodemailer composes the MIME), calendar
  invitations attached to booking notifications (`notifications.booking_id`, `src/domain/ics.ts`), subscription feeds
  `/api/calendar/<token>.ics` read with the owner's rights (`src/server/calendar.ts`). Device and feed tokens are shown once
  and stored as SHA-256 hashes (`src/server/http/tokens.ts`); their routes are `TOKEN_PATHS` of `src/domain/auth.ts` (no
  session).
- **Delivery 8 (reading the other tools, CR-060) is done** (`docs/DELIVERY-8.md`, X-10 added): `keystone.pub_jalons`,
  `cursus.pub_absences` and `vigie.pub_controles` are copied into Crucible's tables with their source (`keystone`, `cursus`,
  `vigie`) every hour by the job `connectors-read` and on demand ("Read now", `/admin/connectors`), once granted
  (`src/server/integrations/connectors.ts`; a view not readable is a state). A row read from another tool is changed there:
  the Server Functions refuse it in Crucible. Codex references (protocols, reports, risk analyses, substitution justifications)
  show the state of their document read at display time from `codex.pub_documents` (`src/server/dal/codex.ts`,
  `CodexRef`; revision in force or a warning, never the title).
- **Delivery 9 (series and limits of bookings, CR-078) is done** (`docs/DELIVERY-9.md`, X-11 added): per resource, free time
  between two bookings (capacity 1), least notice of a new request (`BookingContext.newRequest`: requests and engine
  proposals, never a move or an urgency) and longest booking in days spanned — hard constraints of `checkBooking`
  (`ResourceLimits`), set by the facility manager (`setResourceLimitsAction`); a request repeats weekly (up to 25 more weeks,
  all or none, `bookings.series_ref`).
- **Delivery 10 (maintenance and calibration, CR-073) is done** (`docs/DELIVERY-10.md`, X-12 added): plans per resource
  (`maintenance_plans`, `src/domain/maintenance.ts`, due date computed), interventions append-only (`maintenance_records`,
  triggers), Server Functions `src/features/maintenance/actions.ts` (facility managers), facility tab "maintenance"; a
  blocking plan past due is the hard constraint `maintenance_due` of `checkBooking` (`BookingContext.maintenance`, loaded by
  the requests, `slotFacts` and the engine); daily job `maintenance-reminders` (14 days ahead, once per due date).
- **Delivery 11 (limits of attempts, CR-079) is done** (`docs/DELIVERY-11.md`, X-13 added): `hitRate(bucket, key)`
  (`src/server/http/rate-limit.ts`, thresholds `RATE_LIMITS` in `src/domain/rate-limit.ts`, fixed windows in `rate_counters`)
  on the sign-in routes, the global search, the CSV exports, the assistant, `/api/occupancy` and `/api/calendar`; the address
  is the last `X-Forwarded-For` entry (`clientAddress`); the first excess of a window is audited (area "Security").
- **Delivery 12 (booking forms, CR-075) is done** (`docs/DELIVERY-12.md`, X-14 added): per facility one template per stage
  (`form_templates`: safety checklist `before`, test sheet `after`, incident report `incident`; items typed one per line,
  `src/domain/booking-forms.ts`), kept by the facility managers on the facility tab "forms"; filled from "My schedule"
  (`src/features/forms/actions.ts`, append-only `form_responses`); `startBookingAction` refuses a start until the active
  safety checklist is filled (devices excepted); an incident report notifies the facility's managers.
- **Delivery 13 (end-to-end journeys, CR-080) is done** (`docs/DELIVERY-13.md`, X-15 added): Playwright journeys in
  `tests/e2e/` (`playwright.config.ts`, `npm run test:e2e`, French UI, demo cookie `crucible-role`), run by CI right after
  the smoke test against the same production server; they change the database (run them on a fresh one locally).

## Rules (same as Arche; confirmed by the owner's answers of 22 Oct 2026)

- Reply in **French**. Code, identifiers and commit messages in English. UI strings are English source strings translated
  through `src/i18n`; French is the default language.
- **Never modify the sibling repositories** (Keystone, Arche, Matrix, Codex, Vigie, Cursus).
- Nothing outside the owner's request without approval (additions are the X-n questions of `DECISIONS.md`).
- **The engine proposes, a person decides**: no confirmed booking moves without a traced human decision; the AI assistant
  never writes on its own and never proposes an unvalidated substitution or touches a safety rule.
- Crucible writes only in its schema (`crucible`, role `crucible_app`, T-1) and reads other tools only through their
  `pub_` views. Its own `pub_` views are contracts: never drop or rename a column; new columns go at the end.
- **Access between tools is decided by Matrix (M-17, applied 31 Oct 2026; inventory `docs/ECHANGES.md`)**: a `pub_` view
  is defined only in its owner's migration (never ask Matrix to copy one into `partage/`); Crucible writes in another tool
  only through its API or a `pub_` function it provides, never by `INSERT` / `UPDATE` / `DELETE`; a tool that must write in
  Crucible gets an API or a migration's `crucible.pub_<verb>_<object>` function (`SECURITY DEFINER`,
  `SET search_path = crucible, pg_temp`, caller from `session_user`, Crucible's rules, lock and audit applied,
  `REVOKE EXECUTE … FROM PUBLIC`, signature never changed; it never confirms or moves a booking). A new exchange is declared
  as a link of Matrix's registry (`matrix.liens`: reader, `schema.pub_…` object, `lecture` | `execution`, reason) — through
  `POST /api/liens` once Matrix ships it, until then a short entry in Matrix's `REQUESTS.md`, after the owner's « validé ».
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
