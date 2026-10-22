# Livraison 3 — besoins et anticipation

> 22 oct. 2026, branche `claude/lucid-dirac-7bdq6x`. Plan : [`PLAN.md`](PLAN.md) (L3). Lancée à la demande du responsable
> produit. Questionnaire relu avant la livraison : aucune nouvelle réponse (S-1, S-2, S-5, S-6, F-5, F-6, P-4, R-7 confirmés
> par défaut). Les données réelles (D-3 types d’essai, D-5 projets et besoins à 6–12 mois) ne sont pas encore fournies : tout
> est démontré sur le jeu de démonstration.

## 1. Ce qui est livré

| Domaine | Contenu | Où |
|---|---|---|
| Jalons (S-1) | jalons d’un projet saisis dans Crucible : libellé, date, criticité (contractuel, réglementaire, interne), origine (`crucible`, puis `keystone` quand Keystone publiera `pub_jalons`, K-2) ; ajout, modification, retrait (refusé si des besoins le servent) ; tout est audité | `src/domain/needs.ts`, `src/server/db/schema/needs.ts`, fiche `/projects/[code]` |
| Types d’essai (D-3) | catalogue : code, nom, moyen nominal, durée habituelle (demi-journées), compétences requises (en texte jusqu’à Cursus, S-3) ; tenu par le coordinateur et la direction R&D (F-13) ; retrait du catalogue sans suppression | `/rules`, `createTestTypeAction` |
| Besoins d’essais (spec 03 §6) | deux niveaux avant la réservation : **prévision** (enveloppe en demi-journées sur un moyen, entre deux dates) et **demande** (essai détaillé) ; moyen, durée, date au plus tôt, échéance — **par défaut la date du jalon servi** (rétro-planification) —, type d’essai (propose le moyen nominal et la durée), référence Codex du protocole (S-6), note ; référence `N-AAAA-NNNN` ; une prévision devient une demande par modification ; retrait motivé ; saisis par le chef de projet, le contact partenaire, le coordinateur ou la direction R&D (F-13) | `src/features/needs/actions.ts`, `/my/needs`, `/projects/[code]` |
| Réservation d’un besoin | le formulaire de demande de créneau propose les besoins ouverts du projet (« Besoin servi ») ; la part réservée d’un besoin et ce qu’il reste sont **calculés** depuis ses réservations | `/planning`, `requestBookingAction` |
| Délai de prévenance (F-5) | **10 jours ouvrés pour toutes les entités** (un accord de partage peut fixer un autre délai au partenaire) ; une demande tardive — besoin ou créneau — est acceptée, signalée et comptée dans le pilotage (colonne « Demandes tardives » de l’attente par entité ; l’historique importé n’est jamais compté tardif) | `isLateRequest`, `/dashboard` |
| Plan de charge (F-6, F-11, F-12) | par moyen et par semaine sur **26 semaines** : capacité nette (horaires, fermetures, indisponibilités, capacité), réservé, demandé, et besoins ouverts non réservés **répartis sur les heures ouvertes de leur fenêtre** ; les zones du PDE sont aussi comptées ensemble contre leur règle « une zone à la fois » (P-2) ; **goulots** (> 100 %) avec leur échéance en semaines et les besoins qui y contribuent ; **creux** (< 30 % sur 12 semaines, créneaux à proposer) ; **enveloppes par trimestre jusqu’à 12 mois** ; besoins d’un projet que la personne ne voit pas affichés sans projet ni objet (U-3) ; alerte quand un contrôle réglementaire tombe avant la fin de la fenêtre d’un besoin (R-10) ; tout est calculé, rien n’est stocké | `src/domain/load.ts`, `src/server/dal/needs.ts`, `/load` |
| Rapports d’essai (P-4, S-6) | référence Codex du rapport d’un essai terminé, saisie par les personnes de l’installation ou celles qui saisissent les besoins du projet ; Crucible ne stocke aucun fichier | fiche `/projects/[code]`, `setReportRefAction` |
| Vues publiées (S-5, R-7, S-7) | `pub_moyens` (moyen, installation, site, entité exploitante, capacité, granularité, état) et `pub_reservations` (réservations confirmées, en cours, terminées ; entité, moyen, dates prévues et réelles ; projet, projet Keystone et objet **nuls pour un projet confidentiel**) ; droits déjà posés par Matrix pour Keystone, Vigie et Matrix | `drizzle/0005_share_resources.sql` |
| Connecteurs | écran d’administration : vues des autres outils que Crucible lit (existante, accordée, pas encore publiée) et vues publiées par Crucible | `src/config/connectors.ts`, `/admin/connectors` |
| Accueil | goulots des 26 semaines pour qui planifie ; mes besoins ouverts et mes demandes tardives pour qui les saisit | `/` |

Jeu de démonstration : jalons des quatre projets, cinq types d’essai, six besoins — dont trois prévisions du PDE qui
**surchargent la règle « une zone à la fois » la semaine du 14 décembre 2026 (180 %), signalée 8 semaines à l’avance**
(critère de fin de la livraison), une demande entièrement couverte par sa réservation (B-2026-0011) et une demande tardive
(N-2026-0006). Le contrôle électrique du pilote dû le 16/11 est signalé avant la campagne de tirs de décembre.

## 2. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur.
- `npm test` : **193 tests** sur PostgreSQL 16, dont les règles pures du plan de charge (capacité nette, fermetures,
  répartition d’une prévision, couverture par les réservations, échéance passée, horizon, goulot du PDE à 8 semaines,
  creux, trimestres) et des besoins (rétro-planification, refus, prévenance), et 14 tests d’intégration (jalons et besoins par
  profil, refus, audit, demande tardive, réservation d’un besoin, plan de charge de la démo, contrôle à renouveler, types
  d’essai, rapport, colonnes et masquage des vues `pub_`, connecteurs).
- `npm run db:migrate` sur une base neuve (migrations `0004_needs_milestones`, `0005_share_resources`), `npm run build`,
  `next start` et `npm run test:smoke` : **34 contrôles HTTP** passent, dont le goulot du PDE à 8 semaines, « Mes besoins »
  du chef de projet et d’EPC France, la fiche projet introuvable hors visibilité et les connecteurs. Aucune page en erreur
  pour les neuf profils.

## 3. Choix appliqués, à confirmer (questionnaire)

- **F-11** : une prévision est répartie au prorata des heures ouvertes nettes de sa fenêtre ; la part réservée est retirée.
- **F-12** : goulot au-delà de 100 % ; creux sous 30 % sur 12 semaines ; le PDE jugé par sa règle.
- **F-13** : jalons et besoins saisis par le chef de projet, le contact partenaire (projets non confidentiels de son entité),
  le coordinateur et la direction R&D ; catalogue des types d’essai tenu par le coordinateur et la direction R&D.
- **S-7** : `pub_reservations` publie le projet et l’objet, sauf pour un projet confidentiel.
- **F-5** (confirmé) appliqué à toutes les entités : le test de la livraison 2 qui attendait une demande sans avertissement
  le 2 novembre attend maintenant l’avertissement de prévenance.

## 4. Limites et suites

- Jalons saisis dans Crucible : la lecture de `keystone.pub_jalons` attend que Keystone traite la demande K-2 (transmise le
  22/10, Yhumiii27/Keystone#22). L’écran des connecteurs montrera la vue dès qu’elle sera publiée et accordée.
- Matrix doit recopier `pub_moyens` et `pub_reservations` dans `partage/80-crucible.sql` (règle P-02 de Matrix) : demande
  M-7, à transmettre après validation ([`DEMANDES-MATRIX.md`](DEMANDES-MATRIX.md)). Les droits des lecteurs sont déjà posés.
- `pub_occupation_hebdo` (S-5) est reportée à la livraison 5, avec les instantanés hebdomadaires (X-4) qui l’alimenteront.
- Le plan de charge compte les heures, pas encore les personnes (F-7, livraison 4) ; les substitutions de moyen arrivent
  avec le moteur (livraison 4).
- Les besoins ne sont pas encore proposés automatiquement sur des créneaux : c’est le moteur de la livraison 4.
