# Livraison 12 — formulaires avant, pendant et après la réservation (CR-075)

> 1er nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « lance le prochain point du reste à
> faire », choix CR-075 (ajout de l’analyse comparative du 25 oct. 2026, approuvé par ce choix). Relecture du questionnaire
> avant la livraison : aucune nouvelle réponse. Nouvelle question **X-14** ([`DECISIONS.md`](DECISIONS.md) §10), réponse
> par défaut appliquée, à confirmer.

## 1. Trois formulaires par installation

Nouvel onglet **Formulaires de réservation** de la fiche d’installation (`/facilities/<code>?tab=forms`). Le coordinateur ou le
responsable de l’installation y tient un modèle par étape — un élément par ligne : une ligne qui commence par « = » demande une
réponse écrite, toute autre ligne est une case à cocher ; chaque élément est obligatoire. Une modification augmente la version
(journalisée) ; un formulaire peut être suspendu (« Demandé pour chaque réservation » décoché).

| Formulaire | Quand | Effet |
|---|---|---|
| **Check-list sécurité** | avant le démarrage (réservation confirmée) | un essai ne démarre pas à l’écran tant qu’elle n’est pas remplie pour la réservation (« Remplissez la check-list sécurité avant de démarrer l’essai ») ; une fois |
| **Fiche d’essai** | dès le démarrage, et après la fin | une fois ; signalée « à remplir » dans Mon planning jusque-là |
| **Rapport d’incident** | pendant l’essai | autant que nécessaire ; les coordinateurs et responsables de l’installation reçoivent une notification |

- Remplis depuis **Mon planning** (panneau latéral sur chaque essai) par ceux qui conduisent les essais de l’installation (mêmes
  droits que « Démarrer »).
- **Gardés tels que remplis** (`form_responses`, ajout seul par déclencheurs), avec la copie des éléments de la version
  remplie ; l’onglet liste ceux des 30 derniers jours avec leurs réponses écrites.
- **Limite** : le démarrage par une borne, un agent, un verrouillage ou un badge (CR-071) n’attend pas la check-list — le
  matériel ne peut pas la remplir ; Mon planning la montre « à remplir » tant qu’elle ne l’est pas.

## 2. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **390 tests** sur PostgreSQL 16, dont 7 nouveaux : règles
  pures (saisie des éléments, réponses, étapes ouvertes) et intégration (`src/features/forms/actions.test.ts` : droits et
  versions des modèles, démarrage bloqué sans check-list, remplissage à la bonne étape et une fois, incidents notifiés, ajout
  seul, formulaire suspendu).
- Build de production et `npm run test:smoke` : un contrôle de plus (l’onglet Formulaires de réservation).
- Migrations `0019_booking_forms` (générée) et `0020_booking_forms_append_only` (déclencheurs). Les vues `pub_` ne changent
  pas.
