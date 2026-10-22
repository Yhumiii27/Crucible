# Crucible — vue d’ensemble (livraison 0, cadrage)

> 22 oct. 2026. **Crucible** est l’application du groupe pour **planifier et arbitrer l’usage des moyens d’essais partagés**
> de la R&D : laboratoire 67 (partagé avec EPC France), PDE, laboratoire PDE, atelier mécanique, puis les autres moyens.
> Analyse du besoin et état des lieux des outils : [`../ANALYSE.md`](../ANALYSE.md). Ce document et les suivants sont des
> **propositions** ; les points ouverts sont dans [`../DECISIONS.md`](../DECISIONS.md) avec une réponse par défaut (★).
> Rien ne sera codé avant les réponses du responsable produit.

## 1. Ce que fait Crucible

| Bloc | Pour qui | Résultat |
|---|---|---|
| **Référentiel des moyens et des règles** | responsables des moyens, sécurité | chaque moyen, ses capacités, ses calendriers, ses indisponibilités ; règles d’exclusion validées ; substitutions validées ; règles de priorité écrites |
| **Besoins et réservations** | chefs de projet, techniciens | un projet déclare ses besoins (prévision → demande → réservation) ; le réel est saisi |
| **Anticipation** | coordinateur des moyens, direction R&D | charge prévisionnelle par moyen et par semaine, goulots et creux 4 à 12 semaines à l’avance |
| **Proposition de créneaux** | demandeurs, coordinateur | créneaux compatibles avec toutes les contraintes dures, classés et expliqués |
| **Conflits et arbitrages** | coordinateur, direction R&D, comité avec EPC France | fiche de conflit : options, conséquences par projet, règle appliquée, recommandation ; décision tracée |
| **Aléas et replanification** | tous | scénario de reprise, avant / après par projet, notifications |
| **Pilotage** | direction R&D, responsables | occupation vraie (réservé / réalisé / blocage), attentes par entité, retards imputables, valeur inoccupée |
| **Assistant** | tous | demandes en langage naturel, explications, simulations « et si ? » ; jamais de décision seul (spec 04) |

## 2. Frontières

| Propriétaire | Ce qu’il possède | Ce que Crucible en fait |
|---|---|---|
| **Crucible** | moyens d’essai, règles d’exclusion, substitutions, règles de priorité, besoins d’essais, réservations, conflits, arbitrages, aléas, indicateurs d’occupation | — |
| **Keystone** | projets, jalons, plannings des projets EPC2i | lit `pub_projets` ; demande la publication des jalons (K-2) ; publie ses réservations pour le planning des projets |
| **Vigie** | contrôles réglementaires, zones (dont `essais`, `atex`), coactivité, plans de prévention, permis | demande les contrôles et indisponibilités (V-1) et les suspensions d’essais pour coactivité (V-2) ; publie ses réservations pour la coactivité |
| **Cursus** | personnes, habilitations, absences | lit `pub_salaries`, `pub_titres_detenus` ; demande les absences (CU-1) |
| **Codex** | tous les documents | références : protocoles, modes opératoires, analyses de risque, justifications, rapports d’essai |
| **Matrix** | serveur commun, droits, sites, organigramme (département RDI), journal unifié | s’y déclare ; demandes M-1 à M-6 (dont les sites des laboratoires) |

Crucible tourne **sur PostgreSQL uniquement** dans son schéma `crucible` (rôle `crucible_app`, T-1), n’écrit que dans son
schéma et ne lit les autres outils que par leurs vues `pub_`.

## 3. Glossaire (propositions, à valider)

| Terme | Définition proposée |
|---|---|
| **Installation** | ensemble physique sous une même responsabilité : laboratoire 67, PDE, laboratoire PDE, atelier mécanique |
| **Moyen d’essai** | ce qui se réserve : banc, cellule, enceinte, machine, salle ; appartient à une installation |
| **PDE** | bâtiment unique découpé en **zones** : l’atelier mécanique, le pilote et les pièces laboratoire (« laboratoire PDE ») ; on ne travaille qu’à **une zone à la fois** (pas de coactivité pyrotechnique) — réponse P-2 du 22 oct. 2026 |
| **Laboratoire 67** | *localisation et statut à préciser* : propriété, exploitant, part d’EPC France (P-1) |
| **Entité** | organisation demandeuse : EPC2i, EPC France, autre filiale ou partenaire |
| **Type d’essai** | catégorie d’essai du catalogue R&D (durée type, compétences, moyen nominal) |
| **Substitution** | autorisation **validée** d’exécuter un type d’essai sur un autre moyen que le moyen nominal |
| **Règle d’exclusion** | ensemble de moyens dont au plus *k* fonctionnent en même temps (éventuellement pour certaines activités) |
| **Besoin** | prévision (enveloppe), demande (essai détaillé) ou réservation (créneau confirmé) |
| **Fenêtre gelée** | période à venir où le planning confirmé ne bouge que sur décision humaine |
| **Conflit** | demandes incompatibles sous les contraintes ; donne lieu à une fiche et à un arbitrage |
| **Aléa** | événement qui rend un moyen ou une personne indisponible ou qui ajoute une demande urgente |
| **Taux d’occupation** | heures d’essai réalisées / heures ouvertes nettes (définition à valider, P-5) |

## 4. Documents du cadrage

| Fichier | Contenu |
|---|---|
| [`../ANALYSE.md`](../ANALYSE.md) | analyse du besoin, faisabilité, état des lieux des outils du groupe, données nécessaires, risques |
| [`01-profils-droits.md`](01-profils-droits.md) | profils, portées (entité, installation, projet), matrice des droits |
| [`02-objets.md`](02-objets.md) | objets et modèle de données, indicateurs, vues `pub_` publiées |
| [`03-planification.md`](03-planification.md) | moteur : contraintes, objectif, conflits et arbitrages, anticipation, aléas |
| [`04-assistant-ia.md`](04-assistant-ia.md) | assistant IA : rôle, garde-fous, outils, repli sans IA |
| [`05-ecrans.md`](05-ecrans.md) | registre des écrans et accès par profil |
| [`../ATELIER-CADRAGE.md`](../ATELIER-CADRAGE.md) | guide du premier atelier avec les équipes |
| [`../DECISIONS.md`](../DECISIONS.md) | questions ouvertes et réponses par défaut |
| [`../DEMANDES-KEYSTONE.md`](../DEMANDES-KEYSTONE.md), [`../DEMANDES-VIGIE.md`](../DEMANDES-VIGIE.md), [`../DEMANDES-CURSUS.md`](../DEMANDES-CURSUS.md), [`../DEMANDES-CODEX.md`](../DEMANDES-CODEX.md), [`../DEMANDES-MATRIX.md`](../DEMANDES-MATRIX.md) | ce que Crucible demande aux autres dépôts |
| [`../PLAN.md`](../PLAN.md) | plan de livraisons |
