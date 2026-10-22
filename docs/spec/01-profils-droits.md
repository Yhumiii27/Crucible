# 01 — Profils, portées et droits

> Proposition (livraison 0). Points ouverts : U-1 à U-4 de [`../DECISIONS.md`](../DECISIONS.md).

## 1. Profils

| Clé | Profil | Portée | Rôle |
|---|---|---|---|
| `rd_director` | Direction R&D | toutes entités | fixe les classes de priorité des projets et l’ordre des critères ; arbitre en dernier ressort ; tableaux de bord |
| `coordinator` | Coordinateur des moyens d’essais | installations nommées | tient le planning, lance le moteur, instruit les conflits, arbitre dans sa délégation (A-4) |
| `facility_manager` | Responsable d’installation (labo 67, PDE, labo PDE, atelier) | son installation | tient ses moyens, calendriers, maintenances ; confirme les réservations ; propose les substitutions |
| `safety` | Référent sécurité / QHSE | toutes installations | valide les règles d’exclusion et leurs changements ; peut bloquer un moyen |
| `project_lead` | Chef de projet R&D (demandeur) | ses projets | déclare prévisions et demandes, accepte un créneau proposé, voit les conséquences sur ses jalons |
| `technician` | Technicien / opérateur d’essai | ses réservations, son installation | voit son planning, démarre et termine un essai (saisie du réel), déclare un aléa |
| `partner` | Interlocuteur d’une entité partenaire (EPC France) | son entité, installations partagées | demande et voit ses réservations ; voit l’occupation (pas le détail des projets des autres entités, U-3) |
| `viewer` | Lecteur | selon affectation | lecture |
| `admin` *(hors demande)* | Administrateur Crucible | global | comptes, rôles, référentiels, paramètres, connecteurs ; aucune donnée métier |

Un utilisateur peut porter plusieurs rôles (modèle Keystone et Arche : rôle actif + liste).

## 2. Portées et confidentialité

- Portées : `global`, `entity` (EPC2i, EPC France…), `facility` (installation), `project` (équipe nommée).
- **Confidentialité entre entités** (proposition U-3) : sur une installation partagée, chacun voit **qu’un créneau est
  occupé** et par quelle entité ; le **projet et l’objet de l’essai** ne sont visibles que de l’entité demandeuse, des
  responsables de l’installation, du coordinateur et de la direction R&D.
- Projets confidentiels : un projet marqué confidentiel n’affiche que « Réservé (confidentiel) » hors de son équipe.
- Comme dans Arche, la visibilité est appliquée dans la couche de données (une fonction `visibilityCondition` par objet) ;
  un objet hors portée est un 404.

## 3. Matrice des droits (proposition)

| Action | rd_director | coordinator | facility_manager | safety | project_lead | technician | partner |
|---|---|---|---|---|---|---|---|
| Créer / modifier un moyen, son calendrier | — | ✓ | ✓ (son installation) | — | — | — | — |
| Créer / modifier une règle d’exclusion | — | propose | propose | **valide** | — | — | — |
| Valider une substitution | — | — | ✓ (avec le référent technique, R-4) | avis si sécurité | — | — | — |
| Fixer la classe de priorité d’un projet | ✓ | — | — | — | — | — | — |
| Déclarer un besoin, demander un créneau | — | ✓ | ✓ | — | ✓ | — | ✓ (son entité) |
| Confirmer une réservation | — | ✓ | ✓ | — | — | — | — |
| Lancer le moteur, créer un scénario | ✓ | ✓ | — | — | simulation seule | — | — |
| Arbitrer un conflit | ✓ (tout) | ✓ (dans sa délégation) | — | veto sécurité | — | — | comité (A-4) |
| Déclarer un aléa | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Saisir le réel (démarrer, terminer) | — | ✓ | ✓ | — | — | ✓ | — |
| Voir les tableaux de bord | ✓ | ✓ | son installation | ✓ | ses projets | — | son entité |
