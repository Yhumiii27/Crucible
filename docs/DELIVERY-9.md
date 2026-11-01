# Livraison 9 — séries de réservations et limites par moyen (CR-078)

> 1er nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « lance le prochain point du reste à
> faire », choix CR-078 (ajout de l’analyse comparative du 25 oct. 2026, approuvé par ce choix). Relecture du questionnaire
> avant la livraison : aucune nouvelle réponse. Nouvelle question **X-11** ([`DECISIONS.md`](DECISIONS.md) §10), réponse
> par défaut appliquée, à confirmer.

## 1. Limites d’une réservation, par moyen

Le responsable de l’installation (ou le coordinateur) règle trois limites par moyen, sur la fiche d’installation (onglet
Moyens, colonne « Limites de réservation », « Modifier les limites ») ; chaque changement est écrit au journal. Ce sont des
**contraintes dures**, contrôlées comme les autres (`checkBooking`, `src/domain/booking.ts`) pour une demande, une
confirmation, une proposition du moteur et un scénario de reprise :

| Limite | Règle | Refus |
|---|---|---|
| **Temps libre entre deux réservations** (minutes) | remise en état, nettoyage : aucune réservation tenue du moyen ne finit moins de ce temps avant le début ni ne commence moins de ce temps après la fin ; moyens de capacité 1 seulement (une salle à plusieurs places n’a pas de « suivante ») ; une simple demande ne tient pas le moyen | « Trop près d’une autre réservation du moyen » · durée · références |
| **Prévenance minimale** (heures) | une **nouvelle** demande (d’une personne ou proposée par le moteur) commence au moins ce délai après maintenant ; elle ne s’applique ni à une réservation contrôlée de nouveau, ni à un déplacement par un scénario de reprise, ni à une urgence (A-8) ; elle s’ajoute à la prévenance par entité (F-5), qui reste un avertissement | « Délai de prévenance inférieur à celui que le moyen demande » · délai |
| **Réservation la plus longue** (jours) | jours calendaires couverts, premier et dernier compris | « Plus long que ce que le moyen admet » · jours |

Vides par défaut : rien ne change pour un moyen sans limite.

## 2. Séries hebdomadaires

Le formulaire de demande prend **« Répéter les semaines suivantes »** (0 à 25) : le même créneau chaque semaine. Chaque
semaine est contrôlée contre toutes les contraintes dures, les semaines déjà prises de la série comptant comme tenues ;
**toutes sont demandées ou aucune** : un refus nomme la date de chaque semaine refusée et sa raison. Chaque réservation de
la série porte la référence de la première (`bookings.series_ref`) ; chacune se confirme, se déplace ou s’annule ensuite
comme une réservation seule.

## 3. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **371 tests** sur PostgreSQL 16, dont 9 nouveaux :
  règles pures (temps libre, prévenance d’une nouvelle demande seulement, jours couverts, saisie des limites) et intégration
  (`src/features/resources/limits.test.ts` : droits et journal du réglage, refus citant la limite, série refusée en entier
  avec la date, série demandée avec sa référence, temps libre après une réservation confirmée).
- Migration `0015_booking_limits` (générée) : `resources.buffer_minutes`, `min_notice_hours`, `max_days`,
  `bookings.series_ref`. Les vues `pub_` ne changent pas.
