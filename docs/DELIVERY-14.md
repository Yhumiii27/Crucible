# Livraison 14 — rapports PDF et exports pour la BI (CR-077)

> 1er nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « lance le prochain point du reste à
> faire », choix CR-077 (ajout de l’analyse comparative du 25 oct. 2026, approuvé par ce choix). Relecture du questionnaire
> avant la livraison : aucune nouvelle réponse. Nouvelle question **X-16** ([`DECISIONS.md`](DECISIONS.md) §10), réponse
> par défaut appliquée, à confirmer.

## 1. Rapport mensuel

Nouvel écran **Rapport mensuel** (`/reports`, pilotage ; direction R&D, coordinateur, responsables d’installation, sécurité,
partenaire — comme le tableau de bord). Pour un mois (navigation mois précédent / suivant) et les installations que la personne
voit, ou l’une d’elles :

- par moyen puis par installation et au total : **heures ouvertes nettes** du mois (horaires moins fermetures et
  indisponibilités), **réservé**, **réalisé** (préparation et remise en état comprises), **bloqué** par une règle, en heures et
  en %, et les **réservations non tenues** — le calcul du tableau de bord (`resourceUsages`), jamais stocké ;
- les **réservations du mois**, masquées comme sur le planning (projet confidentiel « Réservé (confidentiel) », projet d’une
  autre entité « Réservé · entité », U-3).

**PDF** : bouton « Imprimer ou enregistrer en PDF » (impression du navigateur, « Enregistrer au format PDF ») ; à
l’impression, le menu, les outils de l’en-tête, les actions de la page et l’assistant sont masqués, la page passe sur fond
blanc. Pas de bibliothèque PDF côté serveur : rien à installer ni à maintenir.

## 2. Exports pour la BI

- Le menu **Exporter** de l’en-tête offre, sur chaque écran exportable, **CSV (Excel)** et désormais **JSON (outils de BI)**
  (`/api/export/<écran>?…&format=json` : un objet par ligne, clés = titres des colonnes, avec les mêmes droits et masques).
- Le rapport mensuel s’exporte ainsi : une ligne par moyen (mois, installation, moyen, heures et taux).
- Pour une alimentation automatique d’un outil de BI, la voie reste la vue `crucible.pub_occupation_hebdo`, accordée par
  Matrix (M-18) : l’export, lui, demande une session.

## 3. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **397 tests** sur PostgreSQL 16, dont 5 nouveaux : mois et
  lignes du rapport (`src/domain/report.test.ts`) ; rapport de la direction R&D et du partenaire (installations vues, projets
  masqués), export CSV puis JSON, refus hors de l’espace (`src/server/dal/report.test.ts`).
- Build de production, `npm run test:smoke` (2 contrôles de plus) et parcours Playwright (le rapport dans le menu du
  coordinateur) ; rendu à l’impression vérifié en PDF A4 (menu et outils masqués).
- Aucune migration.
