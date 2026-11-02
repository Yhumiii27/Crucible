# Livraison 16 — résultats d’essais rattachés à la réservation (CR-081)

> 2 nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « fait les prochains points » (les
> ajouts de l’analyse comparative restants, approuvés par cette demande). Relecture du questionnaire avant la livraison :
> aucune nouvelle réponse. Nouvelle question **X-18** ([`DECISIONS.md`](DECISIONS.md) §10), réponse par défaut appliquée, à
> confirmer.

## 1. Ce qui est saisi

Une fois l’essai **démarré ou terminé**, pour une réservation :

- la **conclusion** : conforme, non conforme, à refaire, sans conclusion ;
- les **mesures**, une par ligne : « nom = valeur unité » ou « nom ; valeur ; unité » (50 au plus) ;
- des **observations** (texte affiché tel que saisi) ;
- les **références Codex** des données brutes et du cahier de laboratoire (état du document lu dans Codex à l’affichage,
  comme les autres références), l’**adresse de l’entrée** du cahier électronique (ELN) quand l’équipe en tient un.

Aucun fichier dans Crucible : Codex reste le référentiel documentaire (décision du 22 oct. 2026). Le rapport d’essai reste la
référence Codex déjà portée par la réservation.

## 2. Qui, où

- Saisi par **qui gère le projet** (chef de projet, direction R&D, coordinateur — `canManageNeeds`) ou par **l’équipe de
  l’installation** qui voit l’objet de la réservation (un technicien ne saisit pas le résultat d’un projet confidentiel, U-3).
- Depuis la **fiche du projet** (nouvelle colonne « Résultat » des réservations) et **Mon planning** (essai en cours ou
  terminé).
- Le **demandeur** est prévenu (cloche, puis e-mail : « Résultat de votre essai »). Journalisé (domaine « Réservations »).

## 3. Versions

Un résultat est **gardé tel que saisi** (table `test_results`, ajout seul par déclencheurs, `drizzle/0024`). « Corriger le
résultat » repart de la dernière version et demande le motif ; la nouvelle version s’affiche, avec son numéro et le motif.

## 4. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **419 tests** sur PostgreSQL 16, dont 10 nouveaux :
  `src/domain/results.test.ts` (mesures, saisie, correction) et `src/features/results/actions.test.ts` (droits, projet
  confidentiel, versions motivées, ajout seul, notification, journal).
- Contrôle de fumée : 1 contrôle de plus (colonne et saisie sur la fiche projet).
- Migrations `0023_test_results` (générée) et `0024_test_results_append_only` (déclencheurs).
