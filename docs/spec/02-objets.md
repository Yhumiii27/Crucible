# 02 — Objets et modèle de données (schéma `crucible`)

> Proposition (livraison 0). Les noms de tables sont ceux du code (anglais) ; les libellés sont en français. Toutes les
> tables sont déclarées dans le schéma `crucible` (`crucible.table(…)`, disposition d’Arche et de Codex), PostgreSQL
> uniquement (T-1). Points ouverts : R-1 à R-9, P-3, P-5.

## 1. Moyens d’essai (référentiel)

| Table | Contenu | Remarques |
|---|---|---|
| `facilities` | **installation** : laboratoire 67, PDE (bâtiment unique, P-2)… ; site (Matrix `pub_sites`), entité exploitante, responsable, coût d’acquisition (pour la valeur de l’occupation), horaires | une installation regroupe des moyens |
| `resources` | **moyen d’essai** réservable : banc, cellule, enceinte, machine d’atelier, salle, **zone** (les zones du PDE : atelier mécanique, pilote, pièces laboratoire) ; capacité simultanée (1 par défaut), granularité (demi-journée / heure), temps de préparation et de remise en état par défaut, état (en service, en maintenance, hors service, retiré) | P-2 : les zones du PDE sont des moyens, liés par une règle d’exclusion |
| `resource_capabilities` | ce qu’un moyen sait faire : types d’essai, plages (charge, pression, température, masse de matière active…) | sert aux substitutions |
| `test_types` | **types d’essai** du catalogue R&D (tir, traction, vieillissement, mesure de vitesse de détonation…) : durée type, compétences requises, moyen nominal | à construire avec les équipes (D-3) |
| `substitutions` | matrice **type d’essai × moyen** : nominal / substitut validé / interdit ; conditions ; **validé par**, date, référence Codex de la justification technique | une substitution non validée n’est jamais proposée (R-4) |
| `mobile_equipment` | équipements partagés déplaçables (instrumentation, caméra rapide, chaîne d’acquisition) | réservés avec l’essai (R-8) |

## 2. Règles et calendriers

| Table | Contenu |
|---|---|
| `calendars`, `calendar_exceptions` | horaires d’ouverture par installation, jours fériés, fermetures (modèle des calendriers de Keystone) |
| `unavailabilities` | maintenance planifiée, contrôle périodique, panne, travaux ; origine (saisie, Vigie, aléa) |
| `exclusion_rules` | ensembles de moyens qui ne peuvent pas fonctionner ensemble : `max_active`, activités concernées (toutes ou certaines), motif (sécurité, personnel commun, énergie, nuisance), **validée par** (sécurité), référence Codex de l’analyse de risque, dates de validité |
| `priority_rules` | règles d’arbitrage ordonnées (spec 03 §5), versionnées : une proposition garde la version des règles qui l’a produite |
| `entity_agreements` | accord de partage avec une entité (EPC France sur le laboratoire 67) : quota (% ou jours par mois), créneaux réservés, délai de prévenance, contact (A-3) |

## 3. Projets, besoins et essais

| Table | Contenu | Remarques |
|---|---|---|
| `projects` | projet demandeur : code, nom, entité (EPC2i, EPC France, autre), équipe, chef de projet, **classe de priorité** (fixée par la direction R&D), lien Keystone (`pub_projets.code`) si le projet y existe | miroir Keystone ou saisie locale (S-1) |
| `project_milestones` | jalons qui portent des essais : date, criticité (contractuel, réglementaire, interne), source (Keystone si publié, sinon saisie) | Keystone ne publie pas encore les jalons (DEMANDES-KEYSTONE K-2) |
| `test_campaigns` | **campagne** : ensemble d’essais d’un projet pour un jalon, avec précédences | |
| `test_needs` | **besoin** à trois niveaux de maturité : *prévision* (enveloppe en jours sur un type de moyen, semaine cible), *demande* (essai détaillé : type, durée, préparation, compétences, date au plus tôt, échéance, moyen souhaité, souplesse) | spec 03 §6 |
| `bookings` | **réservation** : moyen, début, fin, essai, statut (`proposed`, `requested`, `confirmed`, `in_progress`, `done`, `cancelled`, `no_show`), **heures réelles** de début et de fin, opérateurs | le réel alimente le taux d’occupation vrai (P-5) |
| `booking_staff` | personnes affectées à une réservation, compétence tenue | |

## 4. Personnes

| Table | Contenu |
|---|---|
| `users` | comptes (Entra), rôles et portées (spec 01) |
| `people` | personnes planifiables : opérateurs, techniciens, pyrotechniciens ; matricule Cursus si disponible ; entité |
| `skills`, `person_skills` | compétences et habilitations utiles aux essais ; **miroir de Cursus** (`pub_titres_detenus`) quand il existe, sinon saisie locale (S-3) |
| `absences` | absences et indisponibilités des personnes (source à décider, S-3) |

## 5. Planification, conflits et aléas

| Table | Contenu |
|---|---|
| `plan_runs` | exécution du moteur : entrées figées (empreinte), version des règles, scénario produit, indicateurs, durée |
| `scenarios` | plan candidat (proposition, simulation « et si ? », replanification) avec ses écarts au plan confirmé |
| `conflicts` | fiche de conflit (spec 03 §5) : demandes concernées, options, conséquences, recommandation, décideur attendu, statut |
| `arbitrations` | décision : option retenue, règle invoquée, motif, décideur, date ; **jamais modifiée** (une nouvelle décision remplace) |
| `incidents` | aléa : type, moyen ou personne, début, durée prévue, réservations touchées, scénario de reprise |
| `notifications` | notifications stockées (modèle de Vigie) |
| `audit_entries` | piste d’audit append-only (socle Keystone) |

## 6. Indicateurs (calculés, jamais stockés)

Calculés à l’affichage à partir des réservations et des calendriers, comme les indicateurs de Vigie :

- **taux d’occupation** par moyen : heures réelles d’essai / heures ouvertes nettes (hors maintenance et contrôle) ; trois
  variantes affichées côte à côte : *réservé*, *réalisé*, *réalisé + préparation* (P-5) ;
- **taux de blocage** : heures où le moyen était libre mais bloqué par une exclusion ou faute de personnel ;
- **délai d’attente** : date de demande → date d’essai, par entité et par moyen ;
- **retards imputables aux moyens** : jours de retard de jalon dus à l’attente d’un créneau ;
- **réservations non tenues** (`no_show`) et annulations tardives ;
- **charge prévisionnelle** par moyen et par semaine (spec 03 §6) ;
- **valeur immobilisée inoccupée** : coût d’acquisition × (1 − occupation) (pour le PDE à 3 M€).

Des instantanés hebdomadaires (tâche planifiée) gardent l’historique des indicateurs.

## 7. Vues `pub_` publiées (proposition, contrats)

| Vue | Contenu | Lecteurs possibles |
|---|---|---|
| `pub_moyens` | moyens d’essai, installation, site, état | Keystone, Vigie |
| `pub_reservations` | réservations confirmées : moyen, projet, début, fin, statut | Keystone (planning des projets), Vigie (coactivité, plans de prévention) |
| `pub_occupation_hebdo` | occupation par moyen et par semaine | Matrix, direction |
| `pub_journal` | journal d’activité pour le journal unifié de Matrix (convention D18) | Matrix |
