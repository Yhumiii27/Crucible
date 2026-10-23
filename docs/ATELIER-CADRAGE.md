# Premier atelier avec les équipes — guide

> Proposition de la demande initiale : « prendre un premier temps avec les équipes pour préciser les contraintes et voir
> quelles données seraient nécessaires ». Durée proposée : **une demi-journée** (3 h 30), sur place, éventuellement
> suivie de visites des installations. Les réponses alimentent [`DECISIONS.md`](DECISIONS.md) et le questionnaire.

## Participants (D-11)

- Direction R&D (porteur, P-6) — arbitre les règles de priorité.
- Responsables des quatre installations : laboratoire 67, PDE, laboratoire PDE, atelier mécanique.
- Référent sécurité pyrotechnique / QHSE du site — règles d’exclusion.
- Deux ou trois chefs de projet R&D (dont un qui a subi un retard faute de créneau).
- Un représentant d’EPC France (laboratoire 67).
- La personne qui tient aujourd’hui les réservations (si elle existe) ; la DSI pour les comptes et l’IA.

## Déroulé

| Durée | Séquence | Sortie attendue |
|---|---|---|
| 20 min | Le constat, chiffres en main : attentes, retards, « PDE à 30 % » (d’où vient ce chiffre ? D-9) | constat partagé, définition provisoire de l’occupation (P-5) |
| 40 min | **Carte des moyens** : chaque responsable décrit ses moyens, horaires, capacités, opérateurs (D-1, D-6) | liste des moyens réservables (P-2, R-1) |
| 45 min | **Règles de sécurité et d’exclusion** : qu’est-ce qui ne peut pas fonctionner ensemble, pourquoi, pour quelles activités (D-2, R-2, R-3) | règles rédigées, propriétaire désigné |
| 15 min | Pause |  |
| 30 min | **Substitutions** : quels essais peuvent aller ailleurs, qui le valide (D-4, R-4) | première matrice type d’essai × moyen |
| 30 min | **Priorités et partage** : comment on tranche aujourd’hui, accord avec EPC France, qui doit trancher demain (A-1 à A-4, D-7) | principes de priorité écrits, instance d’arbitrage |
| 20 min | **Anticipation** : quels projets, quelles échéances, où sont-elles (S-1, D-5) ; démonstration des maquettes d’écrans | liste des projets du pilote |
| 10 min | Suite : qui fournit quelles données, quand ; périmètre du pilote (P-3) | plan d’actions daté |

## Questions à poser par population

**Responsables d’installation** — Que réserve-t-on chez vous, à quelle maille ? Quels temps de préparation et de remise en
état ? Combien d’opérateurs habilités ? Quelles maintenances et contrôles ? Qu’est-ce qui vous fait perdre des créneaux
(annulations tardives, essais non tenus, essais qui débordent) ?

**Référent sécurité** — Quelles combinaisons d’activités sont interdites et pourquoi ? Sont-elles liées à des quantités
de matière, des distances, des zones ATEX, du personnel commun ? Quelle analyse de risque les fonde ? Une intervention
extérieure suspend-elle les essais (Vigie le fait déjà pour les zones « essais ») ?

**Chefs de projet** — Comment connaissez-vous vos besoins d’essais, à quel horizon ? Quand avez-vous attendu un créneau
pour la dernière fois, et quel retard en a résulté ? Accepteriez-vous un autre moyen, à quelles conditions ?

**EPC France** — Quel est votre usage du laboratoire 67 (volume, régularité) ? Existe-t-il un accord ? Qu’attendez-vous
d’un outil commun (visibilité, prévisibilité, équité) ?

**Direction R&D** — Quels projets sont prioritaires et qui doit le dire ? Quelle part de décision déléguer au
coordinateur ? Quels indicateurs suivre chaque mois ?

## Données à rapporter (gabarits)

Classeur [`atelier/gabarits-donnees-crucible.xlsx`](atelier/gabarits-donnees-crucible.xlsx) (23 oct. 2026) : un onglet par
donnée D-1 à D-11, une ligne par élément, colonnes alignées sur ce que Crucible vérifie à la saisie, listes déroulantes, une
ligne d’exemple et une note par en-tête. L’onglet D-8 (historique) suit exactement le format de l’import de Crucible : ses
lignes se collent telles quelles dans Planning des moyens → Importer l’historique. Le classeur est produit par
`python3 scripts/atelier/gabarits.py` (à relancer si un champ change). Les réponses peuvent aussi être collées dans les blocs
« Données » du questionnaire.
