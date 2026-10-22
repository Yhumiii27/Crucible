# Livraison 2 — moyens d’essais, règles, réservations, mesure de l’occupation

> 22 oct. 2026, branche `claude/lucid-dirac-7bdq6x`. Plan : [`PLAN.md`](PLAN.md) (L2). Lancée à la demande du responsable
> produit, avec ses réponses au questionnaire (56 réponses par défaut et P-2 : **le PDE est un bâtiment unique en zones —
> atelier mécanique, pilote, pièces laboratoire — où l’on ne travaille qu’à un endroit à la fois**). Les données réelles
> (D-1 à D-11) ne sont pas encore fournies : tout est démontré sur le jeu de démonstration.

## 1. Ce qui est livré

| Domaine | Contenu | Où |
|---|---|---|
| Moyens et calendriers | moyens réservables par installation (type, réservation à la demi-journée ou à l’heure — F-1, capacité, temps de préparation et de remise en état — R-5, état) ; horaires d’ouverture par jour (défaut lundi–vendredi 07:00–17:00, R-9) ; fermetures ; indisponibilités ; contrôles périodiques (R-6) avec échéance calculée | `src/domain/calendar.ts`, `src/domain/resources.ts`, `src/server/db/schema/resources.ts`, fiche `/facilities/[code]` |
| Règles d’exclusion | proposées par le coordinateur ou un responsable d’installation, **validées ou retirées par le référent sécurité** (R-3), motif et référence Codex ; une règle validée **refuse** toute réservation qu’elle interdit, en la citant ; une règle en attente avertit seulement | `/rules`, `checkBooking` |
| Règle du PDE (P-2) | les trois zones du PDE sont des moyens liés par la règle `PDE-ONE-ZONE` (au plus une active) | jeu de démonstration |
| Accords de partage | quota (jours par mois) et prévenance (jours ouvrés) par installation partagée et entité partenaire, fixés par la direction R&D (A-3) ; une demande avec moins de prévenance est acceptée avec un avertissement | `/rules`, `setAgreementAction` |
| Réservations | demande (contrôle de **toutes les contraintes dures** : horaires et demi-journées, état du moyen, indisponibilités, contrôles, capacité, règles d’exclusion validées ; avertissements : demande concurrente, prévenance, règle en attente) ; confirmation par un responsable de l’installation (contrôle refait) ; annulation motivée ; démarrer / terminer (heures réelles, rattrapables en fin de journée — X-1) ; libération d’une réservation non tenue deux heures après son début (A-7) ; référence `B-AAAA-NNNN` ; tout est audité | `src/domain/booking.ts`, `src/features/resources/actions.ts` |
| Planning des moyens | semaine par demi-journée et par moyen : réservé, demandé, **bloqué par une règle** (avec la zone qui tient le PDE), indisponible, fermé ; réservations de la semaine et actions ; formulaire de demande | `/planning`, `src/domain/planning-grid.ts` |
| Confidentialité (U-3) | sur une installation partagée, l’objet d’une réservation n’est montré qu’à qui voit le projet (et aux techniciens de l’installation pour un projet non confidentiel) ; sinon « Réservé · entité » ou « Réservé (confidentiel) » | `canSeeBookingDetail`, `src/server/dal/resources.ts` |
| Mon planning | essais de la veille à J+7 des installations de la personne : démarrer, terminer, libérer ; lisible sur téléphone | `/my/schedule` |
| Pilotage de l’occupation (P-5) | par moyen et par installation sur une période : heures ouvertes nettes, taux **réservé, réalisé, réalisé avec préparation, bloqué par une règle**, réservations non tenues ; attente entre demande et essai par entité ; jours utilisés contre le quota du mois ; tout est **calculé**, rien n’est stocké | `/dashboard`, `src/domain/utilisation.ts` |
| Import de l’historique (F-9) | le coordinateur colle des réservations passées (moyen ; projet ; début ; fin ; début réel ; fin réelle ; objet ; « absent » = non tenue) pour la mesure de référence (X-2) | `src/domain/history-import.ts`, `/planning` |

## 2. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur.
- `npm test` : **165 tests** sur PostgreSQL 16, dont les règles pures (calendriers et demi-journées avec changement d’heure,
  contraintes dures — dont la règle du PDE —, grille de la semaine, occupation et blocage, attente, quotas, import) et 12
  tests d’intégration des Server Functions (droits par profil, refus motivés, audit, heures réelles, non-tenue, règles,
  accords, import).
- `npm run db:migrate` sur une base neuve (migration `0003_resources_bookings`), `npm run build`, `next start` et
  `npm run test:smoke` : **27 contrôles HTTP** passent, dont le planning bloqué par le pilote, le masquage pour EPC France et
  le pilotage.
- Parcours vérifié dans le navigateur : un chef de projet demande un créneau du pilote, le coordinateur le confirme.

## 3. Choix appliqués, à confirmer (questionnaire)

- **F-10** : une demande ne bloque pas le moyen ; seule la confirmation le tient (premier confirmé, premier servi, en
  attendant les arbitrages de la livraison 4).
- **R-10** : un contrôle bloque tout créneau qui **finit après son échéance**, tant que le nouveau contrôle n’est pas saisi.
- **P-7** : une réservation non tenue compte comme réservée (et bloquante), jamais comme réalisée.

## 4. Limites

- Les personnes et leurs habilitations ne sont pas encore planifiées (F-7, livraison 4) : les opérateurs sont notés en texte.
- Une indisponibilité saisie sur des jours déjà réservés ne déplace rien (avertissement seulement) : la replanification
  arrive avec la livraison 5.
- Les contrôles sont saisis dans Crucible en attendant que Vigie les publie (V-1).
- Les vues `pub_moyens` et `pub_reservations` arrivent avec la livraison 3 (PLAN).
