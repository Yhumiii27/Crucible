# Livraison 17 — refacturation interne (CR-074)

> 2 nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « fait les prochains points ». Relecture
> du questionnaire avant la livraison : aucune nouvelle réponse. Nouvelle question **X-19** ([`DECISIONS.md`](DECISIONS.md)
> §10), réponse par défaut appliquée, à confirmer.

## 1. Tarifs

Nouvel onglet **Tarifs** de la fiche d’une installation : la liste des tarifs de ses moyens, lisible par ceux qui voient
l’installation. Ses **responsables** (coordinateur, responsable d’installation) ajoutent un tarif : un moyen, **toutes les
entités** ou une seule (le laboratoire 67 peut avoir un tarif propre à EPC France), un montant en **€ par heure**, un
**premier jour**. Un tarif n’est jamais modifié : un tarif plus récent prend le relais à son premier jour, les anciens restent
pour les mois passés ; un tarif saisi par erreur est **retiré** (gardé, avec qui et quand). Journalisé.

Tarif d’une réservation : parmi les tarifs du moyen en vigueur le jour de son début, celui de son entité, sinon celui de toutes
les entités ; sans tarif, la ligne est signalée « Sans tarif ».

## 2. Relevé du mois

Le **rapport mensuel** (`/reports`) a une seconde vue, **Refacturation** (`?view=charges`) : pour le mois et les
installations vues (ou l’une d’elles), un bloc par **entité et projet**, une ligne par réservation commencée dans le mois —
heures réservées, réalisées, **facturées**, tarif, **montant** — et le total du mois.

- Facturé : un essai **terminé** au temps réalisé (démarrage à fin réels ; le créneau réservé quand ils manquent), une
  réservation **non tenue** au créneau réservé ; une réservation confirmée ou en cours apparaît sans montant ; une annulation
  ou une demande n’apparaît pas.
- Un **partenaire** ne lit que les lignes de son entité ; un projet que la personne ne voit pas est compté pour son entité
  sous « Projets non affichés (confidentiels) », jamais nommé (U-3).
- Calculé à chaque lecture, jamais stocké. L’**export** de l’en-tête donne une ligne par réservation (CSV ou JSON) pour la
  comptabilité, montants en euros.

## 3. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **427 tests** sur PostgreSQL 16, dont 8 nouveaux :
  `src/domain/charges.test.ts` (tarif en vigueur, heures facturées, relevé, saisie) et `src/features/charges/charges.test.ts`
  (droits, retrait, relevé de la direction R&D et du partenaire, export).
- Contrôle de fumée : 2 contrôles de plus (relevé du mois, onglet Tarifs).
- Migration `0025_charge_rates` (générée).
