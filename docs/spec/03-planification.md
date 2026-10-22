# 03 — Moteur de planification, conflits, arbitrages et aléas

> Proposition (livraison 0). Points ouverts : F-1 à F-9, A-1 à A-8 de [`../DECISIONS.md`](../DECISIONS.md).
> Principe directeur : **le moteur propose, une personne décide**. Rien n’est déplacé dans le planning confirmé sans une
> validation humaine tracée.

## 1. Le problème, formulé

Crucible résout un **problème d’ordonnancement à ressources limitées** (famille RCPSP, *resource-constrained project
scheduling*) avec contraintes multi-ressources, fenêtres de temps et préférences :

- des **essais** (avec durée, préparation, démontage, séquence éventuelle dans une campagne, date au plus tôt, échéance) ;
- qui demandent **simultanément** un moyen d’essai (ou un moyen de substitution validé), des **personnes qualifiées**
  (opérateur, pyrotechnicien, technicien d’atelier…), parfois un équipement mobile (instrumentation, caméra rapide) ;
- sous des **contraintes dures** (sécurité, exclusions mutuelles, habilitations, disponibilité, maintenance et contrôles
  réglementaires, horaires d’ouverture) ;
- et des **objectifs** hiérarchisés (§4).

Ce problème est connu, bien outillé et **faisable** à l’échelle d’EPC (quelques dizaines de moyens, quelques centaines
d’essais par trimestre) : il ne demande ni gros calcul ni IA pour être résolu correctement. L’IA sert à **dialoguer**,
**expliquer** et **préparer les données** (spec 04), pas à décider.

## 2. Entrées du moteur

| Entrée | Origine | Exemple |
|---|---|---|
| Moyens d’essai, leurs capacités, calendriers | référentiel Crucible (spec 02 §1) | PDE : 1 essai à la fois, lun–ven 7h–17h |
| Indisponibilités | maintenance (Crucible), contrôles périodiques (Vigie, à demander), aléas | PDE indisponible du 3 au 5 nov. (VGP) |
| Règles d’exclusion et de cohabitation | référentiel des règles, validées par la sécurité | « PDE, labo PDE et atelier méca : jamais plus d’un actif » (à confirmer, R-2) |
| Substitutions validées | matrice type d’essai × moyen | « essai de traction T-12 : labo 67 ou atelier méca » |
| Besoins des projets | demandes d’essais (spec 02 §3), dérivées des échéances | campagne de 6 tirs avant le jalon J3 du projet X |
| Personnes, qualifications, absences | Cursus (à demander), sinon saisie locale | 2 pyrotechniciens habilités, congés |
| Règles de priorité | paramètres d’arbitrage (§5) | classe de priorité, quota EPC France |
| Planning confirmé | réservations existantes | ne bouge pas sans accord dans la fenêtre gelée |

## 3. Contraintes

### 3.1 Contraintes dures (jamais violées par une proposition)

1. **Capacité** d’un moyen (en général 1 essai à la fois ; certaines salles : N postes).
2. **Exclusions mutuelles** entre moyens (R-2) : un ensemble de moyens dont au plus *k* peuvent être actifs au même
   instant, éventuellement **conditionné** au type d’activité (ex. « tir pyrotechnique au PDE interdit pendant une activité
   avec présence humaine à l’atelier »). Forme générale : `ExclusionRule { moyens[], activités[]?, max_simultanés, motif,
   validée_par, référence_Codex }`.
3. **Calendrier** : horaires d’ouverture, jours fériés, fermetures, indisponibilités, contrôles réglementaires échus
   (un moyen dont le contrôle périodique est en retard est **bloqué**, R-6).
4. **Personnes** : chaque essai demande des compétences ; une personne ne fait qu’une chose à la fois ; l’habilitation
   doit être valide à la date de l’essai.
5. **Précédences** dans une campagne (l’essai B après l’analyse de A, délai minimal entre deux tirs, temps de
   refroidissement…).
6. **Substitution** : un essai ne va que sur un moyen **validé** pour son type (jamais de substitution « devinée »).
7. **Fenêtre gelée** : les réservations confirmées dans les *N* prochains jours (F-4, défaut 10 jours ouvrés) ne sont pas
   déplacées par le moteur ; seule une décision humaine les déplace.

### 3.2 Contraintes souples (pénalisées)

- échéance d’un essai (retard pondéré par la priorité et la criticité du jalon) ;
- préférence de moyen (le moyen « nominal » avant la substitution) ;
- regroupement (enchaîner les essais d’une campagne, limiter les changements de configuration) ;
- stabilité (ne pas bouger ce qui était déjà planifié) ;
- équité entre équipes et respect des quotas convenus (EPC France, A-3).

## 4. Objectif (ordre lexicographique proposé, F-2)

1. **Sécurité** : contraintes dures, toujours.
2. **Échéances critiques** : minimiser les retards des jalons classés « critiques » (contractuels, réglementaires).
3. **Retard pondéré** : Σ priorité × jours de retard sur les autres échéances.
4. **Stabilité** : minimiser le nombre et l’ampleur des déplacements d’essais déjà planifiés.
5. **Utilisation** : maximiser l’occupation des moyens coûteux (le PDE d’abord), regrouper les essais.
6. **Équité** : écart aux quotas convenus entre entités.

L’ordre est un **paramètre** tenu par la direction R&D (A-1) ; chaque proposition affiche la contribution de chaque
critère pour rester explicable.

## 5. Arbitrage des conflits

Un **conflit** existe quand l’ensemble des demandes ne tient pas dans les capacités sous les contraintes dures, ou quand
deux demandes visent le même créneau. Le moteur ne tranche pas : il produit une **fiche de conflit** :

| Élément | Contenu |
|---|---|
| Demandes en concurrence | projets, essais, demandeurs, entités (EPC2i, EPC France…) |
| Options | 2 à 4 scénarios : A passe d’abord ; B passe d’abord ; B sur un moyen de substitution ; découpage ; heures étendues |
| Conséquences de chaque option | retard prévu sur chaque jalon (jours), marge restante, essais décalés en cascade, occupation |
| Règle appliquée | la règle de priorité qui départage (ex. « jalon contractuel > développement interne ») et son rang |
| Recommandation | l’option la mieux classée selon §4, avec la raison en une phrase |
| Décideur attendu | selon la matrice d’arbitrage (A-4) : responsable des moyens, sinon direction R&D, sinon comité avec EPC France |

**Règles de priorité** (paramétrables, A-2) — proposition d’amorce, dans l’ordre :

1. sécurité et réglementaire (essai exigé par un contrôle, une homologation, une certification) ;
2. engagement client contractuel daté (pénalités, livraison) ;
3. jalon de projet critique (marge ≤ 0) ;
4. classe de priorité du projet (P1 stratégique, P2, P3) fixée par la direction R&D, **pas par l’entité demandeuse** ;
5. marge (*slack*) la plus faible en premier ;
6. ancienneté de la demande (premier arrivé) ;
7. à égalité : arbitrage humain.

La **priorité « de fait » d’EPC France** observée aujourd’hui est remplacée par une règle **écrite** : quota ou créneaux
réservés au laboratoire 67, ou priorité égale aux projets EPC2i selon les mêmes critères (A-3). Chaque arbitrage est
journalisé (qui, quand, option retenue, règle invoquée, motif) dans la piste d’audit append-only.

## 6. Anticipation : plan de charge prévisionnel

À partir des **jalons des projets** et de leurs **plans d’essais** (même approximatifs : « ~15 jours de PDE avant
mars »), Crucible calcule une **charge prévisionnelle** par moyen et par semaine (rétro-planification : date de besoin =
échéance − durée d’analyse − marge). Il signale :

- les **goulots** (charge > capacité nette) 4 à 12 semaines à l’avance ;
- les **creux** (le PDE à 30 % : créneaux à proposer aux projets qui pourraient avancer leurs essais) ;
- les demandes **tardives** (soumises dans la fenêtre gelée) et le respect du délai de prévenance (F-5).

Trois niveaux de maturité d’un besoin : **prévision** (enveloppe en jours, semaine cible), **demande** (essais
détaillés, créneau souhaité), **réservation** (créneau confirmé). Le moteur planifie les trois, avec une confiance
décroissante.

## 7. Aléas et replanification

Un **aléa** (panne, contrôle non conforme, absence, essai à refaire, retard d’un prototype, nouvelle demande urgente)
est saisi avec sa durée prévue. Crucible :

1. identifie les réservations touchées ;
2. calcule un **scénario de replanification** qui respecte la fenêtre gelée sauf pour les essais directement touchés ;
3. affiche les **conséquences par projet** (avant / après : dates d’essai, retard sur jalon, marge) ;
4. propose les substitutions validées disponibles ;
5. soumet le scénario au décideur ; une fois accepté, **notifie** les demandeurs touchés (cloche, e-mail) et journalise.

Les scénarios « et si ? » (simulation) utilisent le même mécanisme sans rien publier.

## 8. Technique (proposition, T-3)

- **Règles et calculs purs** dans `src/domain/` (comme Keystone et Arche) : calendriers, contrôle des contraintes dures
  (`checkBooking`), détection de conflits, charge prévisionnelle, rétro-planification. Testés par valeurs.
- **Solveur** en deux temps :
  1. *L4* : heuristique déterministe en TypeScript (tri par priorité et marge, placement au plus tôt, réparation
     locale), suffisante pour proposer et expliquer ;
  2. *si besoin* : solveur de contraintes (programmation par contraintes, ex. OR-Tools CP-SAT) exécuté par le worker, pour
     l’optimisation globale du trimestre. Décision reportée à la mesure réelle (taille des données).
- Granularité : la **demi-journée** par défaut (F-1), l’heure pour les moyens qui le demandent.
- Le moteur est **déterministe** : mêmes entrées, même proposition (indispensable pour la confiance et les tests).
