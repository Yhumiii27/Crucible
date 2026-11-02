# Livraison 18 — consommables et stock des essais (CR-076)

> 2 nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « fait les prochains points ». Relecture
> du questionnaire avant la livraison : aucune nouvelle réponse. Nouvelle question **X-20** ([`DECISIONS.md`](DECISIONS.md)
> §10), réponse par défaut appliquée, à confirmer.

## 1. Onglet « Consommables » de l’installation

Lisible par ceux qui voient l’installation ; ses **responsables** (coordinateur, responsable d’installation) :

- déclarent un **consommable** (nom, unité, seuil d’alerte), le modifient ou le mettent de côté ;
- **réceptionnent un lot** (référence, quantité, date de péremption facultative ; un lot déjà périmé est refusé) ;
- **corrigent le stock** : ajustement d’inventaire (signé) ou mise au rebut, avec le motif ;
- fixent les **besoins d’un type d’essai** : la quantité par essai (0 la retire).

Le stock n’est jamais stocké : c’est la somme des **mouvements** (réception, utilisation par un essai, ajustement, mise au
rebut), gardés tels qu’enregistrés (ajout seul, `drizzle/0027`). L’onglet montre le stock, les lots restants et leur
péremption, les alertes, les besoins par type d’essai et les mouvements des 30 derniers jours.

## 2. Décompte à la fin de l’essai

Quand un essai se termine (Mon planning ou un appareil de mesure, livraison 7), dans la même transaction, les quantités que
son **type d’essai** demande sont prises dans les lots de l’installation qui **expirent en premier** ; un lot périmé n’est
jamais utilisé ; ce qui manque est enregistré sans lot, et le stock négatif le montre. Une seule fois par réservation ;
journalisé.

## 3. Alertes et réservations signalées

- **Mon planning** signale une réservation confirmée que le stock ne couvrira pas : stock non périmé à sa date, moins ce que
  les réservations précédentes de l’installation demandent (« Consommables manquants », avec la quantité).
- Tâche quotidienne **`consumables-alerts`** : les responsables de l’installation sont prévenus d’un consommable sous son
  seuil (une fois par semaine), d’un lot périmé ou qui expire dans les 30 jours (une fois).

## 4. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **436 tests** sur PostgreSQL 16, dont 9 nouveaux :
  `src/domain/consumables.test.ts` et `src/features/consumables/actions.test.ts` (droits, lots, besoins, réservation signalée,
  décompte à la fin de l’essai, alertes une fois, mise au rebut, ajout seul).
- Contrôle de fumée : 1 contrôle de plus (onglet Consommables).
- Migrations `0026_consumables` (générée) et `0027_consumable_moves_append_only` (déclencheurs).
