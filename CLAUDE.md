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
  registration (M-6 done 4 Nov 2026). Claude's activation waits on the IT department (I-3).
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
- **Delivery 14 (reports and BI exports, CR-077) is done** (`docs/DELIVERY-14.md`, X-16 added): screen `/reports` (monthly
  report: utilisation per resource and facility from `resourceUsages`, bookings of the month masked; `src/domain/report.ts`,
  `src/server/dal/report.ts`), printed or saved as PDF by the browser (print CSS hides the shell: `aside`, `[data-print-hide]`,
  dialogs); every export also in JSON (`/api/export/<screen>?format=json`, menu "JSON (BI tools)").
- **Delivery 15 (REST API and webhooks of the bench systems, CR-083) is done** (`docs/DELIVERY-15.md`, `docs/API.md`, X-17
  added): API clients per facility (`api_clients`, token `cra_` kept as a hash, facility tab "api", `src/features/api/`),
  read-only `/api/v1/resources`, `/bookings`, `/bookings/<ref>`, `/events` (`src/server/api/index.ts`, masking `apiBooking`
  of `src/domain/api.ts`); events written by database triggers on `bookings` and `incidents` (`api_events`, append-only,
  `drizzle/0022`); signed webhooks delivered every minute by the job `api-webhooks` (`src/server/api/webhooks.ts`). The API
  never writes in the planning.
- **Delivery 16 (test results, CR-081) is done** (`docs/DELIVERY-16.md`, X-18 added): `test_results` (append-only versions per
  booking, `drizzle/0023`–`0024`; `src/domain/results.ts`: conclusion, measurements one per line, Codex references of raw data
  and lab notebook, ELN address — never a file), recorded by `recordResultAction` (`src/features/results/`: the project's
  managers, or who runs the facility and sees the booking's detail) from the project sheet and My schedule; the requester is
  notified (`test_result`).
- **Delivery 17 (internal chargeback, CR-074) is done** (`docs/DELIVERY-17.md`, X-19 added): dated rates per resource and
  entity (`charge_rates`, `drizzle/0025`; withdrawn, never deleted; facility tab "rates", `src/features/charges/`), statement of
  a month computed at each read (`src/domain/charges.ts` `rateFor` / `billedHours` / `chargeStatement`, `src/server/dal/charges.ts`;
  a done test billed at its realised time, a no-show at its booked slot; a partner reads its entity only), view "Chargeback" of
  `/reports` (`?view=charges`), exported per booking for the accounting.
- **Delivery 18 (consumables and stock, CR-076) is done** (`docs/DELIVERY-18.md`, X-20 added): per facility `consumables`,
  `consumable_lots` (expiry), `consumable_moves` (append-only, `drizzle/0026`–`0027`) and `test_type_consumables`
  (`src/domain/consumables.ts`: `balances`, `pickLots` earliest expiry first, `alertsOf`, `shortages`); `consumeForBooking`
  (`src/server/consumables.ts`) runs in the transaction that ends a test (screen and device); facility tab "consumables"
  (`src/features/consumables/`), "Consumables short" in My schedule, daily job `consumables-alerts`.
- **Delivery 19 (phones and offline, CR-082) is done** (`docs/DELIVERY-19.md`, X-21 added): top bar and menu drawer up to
  1024 px (`src/components/app/shell/mobile-menu.tsx`), web app manifest (`src/app/manifest.ts`, opens My schedule), service
  worker `/sw.js` (`src/app/sw.js/route.ts`: last copy of My schedule and the app's static files only, dropped at sign-out);
  starts and ends without network queued on the phone, each tied to the account that recorded it (`src/features/offline/`) and applied by `syncOfflineEventsAction` at the
  instant recorded with every check of the screen (48 h at most); Playwright phone journey `tests/e2e/mobile.spec.ts`.
- **Delivery 20 (projects and people read, CR-060 continued) is done** (`docs/DELIVERY-20.md`, X-22 added): `readKeystoneProjects`
  (`keystone.pub_projets`: name follows Keystone, `projects.keystone_closed`, `drizzle/0028`) and `readCursusPeople`
  (`cursus.pub_salaries`: name follows Cursus, a person who left is set aside) in `src/server/integrations/connectors.ts`;
  `keystoneRdProjectsToAdd` lists the open R&D projects of Keystone not in Crucible on `/admin/organisation` (added with the
  project form, Keystone code filled in). Vigie suspensions (V-2): filed with Matrix as M-21 on 5 Nov 2026 (Matrix#73).
- **Delivery 21 (sites and entities read from Matrix, CR-060 continued) is done** (`docs/DELIVERY-21.md`, X-23 added; M-6 done by
  Matrix 4 Nov 2026: laboratoire 67 and PDE on site `smc`, subsidiary `SMC` EPC France): `sites.matrix_code` and
  `entities.matrix_code` (`drizzle/0029`), set by the administrator (`linkMatrixAction`, or a site / entity added from Matrix on
  `/admin/organisation`); `readMatrixSites` / `readMatrixEntities` make the name (and a site's city and country) follow
  `matrix.pub_sites` / `matrix.pub_filiales`; `matrixReferentials` lists Matrix's ones with their link.
- **Edition from Matrix (Matrix's request M-19, done 6 Nov 2026)**: `crucible.pub_editer(p_table, p_action, p_cle, p_valeurs, p_par,
  p_motif)` (`drizzle/0030_pub_editer.sql`, `docs/ECHANGES.md` §5): the IT department corrects the reference tables (entities,
  sites, facilities, resources without the booking limits, projects, people, test types, skills) from Matrix's viewer; closed
  lists of tables and columns, Crucible's checks, « retirer » archives, a name that follows another tool is refused, audited
  (area Administration, actor « <name> (Matrix) »). Bookings, audit trail, append-only tables, accounts, tokens, exclusion
  rules stay closed. A new open table or column is added to this function by a new migration (`pub_editer` is replaced, its
  signature never changes).
- **Delivery 22 (test suspensions read from Vigie, CR-060 continued, V-2) is done** (`docs/DELIVERY-22.md`, X-24 added): prepared before
  Matrix publishes `vigie.pub_suspensions_essais` (M-21, Matrix#73); `vigie_zone_resources` (`drizzle/0031`, kept by the facility
  managers with `setVigieZonesAction`, tab "calendar"); `readVigieSuspensions` (`src/domain/vigie-suspensions.ts` `suspensionPlan`)
  makes each suspension a `works` unavailability (source `vigie`, `source_ref` `suspension:<id>`, whole days) that follows Vigie and
  cannot be removed in Crucible; covered bookings are never moved, the facility's managers get `outside_works`.

## Rules (same as Arche; confirmed by the owner's answers of 22 Oct 2026)

- Reply in **French**. Code, identifiers and commit messages in English. UI strings are English source strings translated
  through `src/i18n`; French is the default language.
- **Never modify the sibling repositories** (Keystone, Arche, Matrix, Codex, Vigie, Cursus).
- Nothing outside the owner's request without approval (additions are the X-n questions of `DECISIONS.md`).
- **The engine proposes, a person decides**: no confirmed booking moves without a traced human decision; the AI assistant
  never writes on its own and never proposes an unvalidated substitution or touches a safety rule.
- Crucible writes only in its schema (`crucible`, role `crucible_app`, T-1) and reads other tools only through their
  `pub_` views. Its own `pub_` views are contracts: never drop or rename a column; new columns go at the end.
- **Access between tools is decided by Matrix (M-17, 31 Oct 2026; M-18, 1 Nov 2026; inventory `docs/ECHANGES.md`)**: Matrix
  defines and owns every `pub_` view (screen "Publications", role `matrix_gestion`): a new migration never creates, replaces,
  alters or drops a `pub_` view (the three that did, 0002, 0005, 0009, stay as applied), and never drops or renames a column
  of a table a published view reads without an entry in Matrix's `REQUESTS.md` first (`src/server/db/pub-views-guard.test.ts`);
  a new publication or column is asked of Matrix. Crucible writes in another tool only through its API or a `pub_` function
  it provides, never by `INSERT` / `UPDATE` / `DELETE`; a tool that must write in Crucible gets an API or a migration's
  `crucible.pub_<verb>_<object>` function (`SECURITY DEFINER`, `SET search_path = crucible, pg_temp`, caller from
  `session_user`, Crucible's rules, lock and audit applied, `REVOKE EXECUTE … FROM PUBLIC`, signature never changed; it never
  confirms or moves a booking), executed through a "write" link decided in Matrix. A need elsewhere (read a view, execute a
  function) is declared as a link of Matrix's registry (`matrix.liens`: reader, `schema.pub_…` object, `lecture` |
  `execution`, reason) — Matrix's screen "Links between tools" or a short entry in its `REQUESTS.md`, after the owner's
  « validé ».
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
