# Livraison 5 — aléas, scénarios, pilotage complet

> 22 oct. 2026, branche `claude/lucid-dirac-7bdq6x`. Plan : [`PLAN.md`](PLAN.md) (L5). Lancée à la demande du responsable
> produit. Questionnaire relu avant la livraison : aucune nouvelle réponse (A-8, F-8, X-4 confirmés par défaut). Les données
> réelles ne sont pas encore fournies : tout est démontré sur le jeu de démonstration.

## 1. Ce qui est livré

| Domaine | Contenu | Où |
|---|---|---|
| Aléas (spec 03 §7, A-10) | déclaration d’une **panne** (le moyen devient indisponible, source « aléa ») ou d’une **absence** (la personne est retirée) ; numéro `AL-AAAA-NNNN` ; déclarée par tous les profils métier sauf la consultation (une absence : la sienne ou celle d’une personne de ses installations) ; clôture par le déclarant, un responsable de l’installation ou la direction R&D (l’indisponibilité s’arrête alors) | `src/features/incidents/actions.ts`, `/incidents` |
| Scénario de reprise (A-10) | calculé **aussitôt** : seules les réservations confirmées non démarrées touchées par l’aléa bougent, au plus tôt à partir du début de l’aléa, sur leur moyen puis une substitution validée, avec des personnes habilitées libres et leurs équipements ; toutes les autres réservations restent ; **avant / après par projet** (créneau, échéance, retard avant et après) ; numéro `S-AAAA-NNNN`, version des règles de priorité citée | `src/domain/recovery.ts`, `src/server/planning/scenarios.ts` |
| Décision | le **coordinateur de toutes les installations touchées** ou la **direction R&D** accepte (chaque déplacement est contrôlé à nouveau contre toutes les contraintes dures, les réservations sont déplacées avec leurs personnes et équipements, auditées, leurs demandeurs notifiés ; un déplacement devenu impossible est sauté avec son motif) ou refuse, motif obligatoire ; **rien ne bouge avant la décision** | `decideScenarioAction`, `applyScenario` |
| Simulations « et si ? » | un moyen hors service sur une période : les mêmes conséquences, **jamais appliquées ni notifiées** (direction R&D, coordinateur, chefs de projet) | `simulateAction` |
| Urgences (A-8) | déclarées par la direction R&D ou le coordinateur, motivées ; l’essai urgent est placé au plus tôt, **même dans la fenêtre gelée** ; les réservations qu’il chevauche (son moyen, une règle d’exclusion, ses personnes ou équipements) sont replacées **après lui** ; le décideur valide ; l’essai urgent devient une réservation confirmée ; les urgences sont comptées dans le pilotage | `declareUrgencyAction`, `urgencyPlan` |
| Notifications (F-8, F-15) | **cloche** (badge des non lues dans la barre latérale, écran `/notifications`, « tout marquer comme lu ») : réservation confirmée, annulée ou déplacée, aléa sur un essai, scénario à trancher, conflit à arbitrer, arbitrage en retard (une fois par jour au décideur, puis aussi à la direction R&D après 2 jours ouvrés, A-6), récapitulatif hebdomadaire des essais des deux semaines à venir ; jamais de notification de sa propre action ; **e-mail** en français par le worker (`CRUCIBLE_MAIL_TRANSPORT=file` : un `.eml` par notification) | `src/server/notify/`, `src/server/jobs/registry.ts` |
| Pilotage complet (P-8, P-9, X-4) | urgences déclarées sur la période ; **valeur de la capacité inoccupée** par installation (coût d’acquisition × part non réalisée ; coût saisi par la direction R&D sur la fiche de l’installation) ; **tendance hebdomadaire** d’après les **instantanés** (calculés une fois par semaine terminée, jamais recalculés) ; **retards imputables aux moyens** (besoins dont le dernier jour d’essai dépasse l’échéance, en jours ouvrés) | `/dashboard`, `src/server/planning/snapshots.ts`, `src/server/dal/incidents.ts` |
| Vue publiée | `crucible.pub_occupation_hebdo` (semaine, moyen, installation, heures ouvertes nettes, réservées, réalisées, avec préparation, bloquées, non tenues, taux réalisé, date de calcul) pour Matrix | `drizzle/0009_share_weekly.sql`, `/admin/connectors` |

Migrations : `0008_incidents_notifications` (tables `incidents`, `scenarios`, `notifications`, `weekly_snapshots`, colonne
`facilities.acquisition_keur`), `0009_share_weekly` (vue). Jeu de démonstration : coûts d’acquisition (laboratoire 67 850 k€,
PDE 3 000 k€) et instantanés des six dernières semaines.

**Scénario de bout en bout (critère de fin de la livraison)** : le technicien du PDE déclare le pilote en panne du 26 au
28 octobre ; Crucible crée l’aléa `AL-2026-0001`, l’indisponibilité et le scénario `S-2026-0001` : la campagne de tirs
d’Orion (`B-2026-0011`, mardi 27) passe au jeudi 29, à l’heure pour son échéance du 30, avec ses personnes habilitées ; la
réservation seulement demandée de la salle d’analyse n’est pas touchée. Le coordinateur et la direction R&D reçoivent
« Scénario à trancher », la cheffe de projet « Aléa sur votre essai » ; le coordinateur accepte, la réservation est déplacée,
la cheffe de projet reçoit « Votre essai a été déplacé » ; le worker écrit les quatre e-mails en français.

## 2. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur.
- `npm test` : **286 tests** sur PostgreSQL 16, dont les règles pures de la reprise (réservations touchées, placement au plus
  tôt, absence sans autre personne habilitée, urgence qui déplace une réservation après elle) et **12 tests d’intégration** :
  le scénario de bout en bout ci-dessus (aléa, indisponibilité, scénario, notifications, décision, déplacement, audit,
  e-mails `.eml`), la clôture, la simulation qui ne déplace ni ne notifie rien, l’urgence (droits, motif, réservation
  urgente, réservations replacées après elle), les droits de déclaration d’une absence, les relances d’arbitrage (une par
  jour, escalade), le récapitulatif, le coût d’acquisition, les instantanés et les colonnes de `pub_occupation_hebdo`.
- `npm run db:migrate` sur une base neuve, `npm run build`, `next start` et `npm run test:smoke` : **43 contrôles HTTP**
  passent (dont aléas et scénarios, cloche, pilotage complet) ; parcours vérifié dans le navigateur (déclaration d’une panne
  par le formulaire, scénario affiché avec avant / après, badge de la cloche).

## 3. Choix appliqués, à confirmer (questionnaire)

- **A-10** : qui déclare un aléa, ce que le scénario déplace (les réservations touchées seulement), qui décide.
- **F-15** : événements notifiés, relances d’arbitrage, récapitulatif du lundi, e-mail en fichier en attendant le relais.
- **P-8** : valeur inoccupée = coût d’acquisition × (1 − taux réalisé avec préparation).
- **P-9** : retard imputable = dernier jour d’essai réservé après l’échéance, en jours ouvrés, toutes causes.

## 4. Limites et suites

- Pas encore de transport SMTP ni Microsoft Graph : les e-mails sont déposés en fichiers (`CRUCIBLE_MAIL_TRANSPORT=file`).
- Les retards ne distinguent pas leur cause (aléa, conflit, demande tardive) ; les absences restent saisies dans Crucible en
  attendant `cursus.pub_absences` (CU-1) ; les pannes ne sont pas encore reçues de Vigie (V-1, V-2).
- La vue `pub_occupation_hebdo` doit être recopiée dans le partage de Matrix : demande **M-8**
  ([`DEMANDES-MATRIX.md`](DEMANDES-MATRIX.md)), validée le 23/10/2026 et transmise (Yhumiii27/Matrix#17).
- Livraison suivante : L6, assistant IA (spec 04), après le choix du fournisseur (I-1 à I-4).
