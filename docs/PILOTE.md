# Pilote — plan de démarrage et suivi

> 23 oct. 2026. Demande du responsable produit : « lance le pilote ». Cadre : [`PLAN.md`](PLAN.md) (ligne « Pilote ») —
> Crucible devient **la référence des réservations** des installations du pilote, avec une **mesure de référence** avant le
> démarrage, pendant **4 semaines d’usage réel**. Décisions appliquées : P-3 (les quatre installations citées — laboratoire 67,
> PDE et ses zones), F-9 (reprise de l’historique, pas de synchronisation Outlook, Crucible seule référence au démarrage),
> X-2 (mesure avant / après), T-6 (hébergement de Keystone et Arche, données en France). Nouvelles questions : P-10, X-7
> ([`DECISIONS.md`](DECISIONS.md)).

## 1. Ce qui est prêt dans Crucible

Toutes les livraisons du plan sont faites (L1 à L6). Pour le pilote, Crucible ajoute l’écran **Pilote** (`/pilot`, menu
Pilotage ; direction R&D, coordinateur, responsables d’installation, référent sécurité) :

- **Définir le pilote** (direction R&D) : premier jour, durée (4 semaines par défaut), installations, semaines de la mesure de
  référence (13 par défaut, soit le trimestre précédent) ; enregistré et tracé au journal.
- **Liste de contrôle du démarrage**, calculée à partir de ce qui est enregistré : moyens de chaque installation, règles
  d’exclusion validées par la sécurité, contrôles réglementaires, responsables et techniciens par installation, coordinateur,
  référent sécurité, personnes et compétences, projets et jalons, **historique importé sur la période de référence**,
  connexion Microsoft Entra. Chaque point manquant renvoie à l’écran qui le règle.
- **Mesure de référence et pilote (X-2)** : pour chaque installation du pilote que la personne voit, et pour l’ensemble —
  réalisé avec préparation, réservé, bloqué par une règle (P-5), réservations, non tenues, attente moyenne entre la demande et
  l’essai, demandes tardives — avant le pilote, pendant le pilote (jusqu’à aujourd’hui) et l’écart. Calculé, jamais stocké.

## 2. Prérequis hors de Crucible (à lever avant le premier jour)

| # | Prérequis | Qui | État au 23/10/2026 | Où le suivre |
|---|---|---|---|---|
| 1 | **Atelier avec les équipes** ([`ATELIER-CADRAGE.md`](ATELIER-CADRAGE.md)) : moyens, règles d’exclusion, substitutions, priorités, projets du pilote | Responsable produit, direction R&D | à planifier | D-11 (participants) |
| 2 | **Données D-1 à D-10** : moyens, règles, types d’essai, substitutions, projets et besoins, personnes, accord EPC France, **historique 6 à 12 mois** (D-8), origine des 30 % (D-9), contrôles | Responsables d’installation, référent sécurité, chefs de projet | à fournir | questionnaire « Décisions Crucible », blocs Données |
| 3 | **Hébergement** (T-6) : même hébergeur que Keystone et Arche, données et sauvegardes en France ; kit Coolify `deploy/compose.shared.yaml` | DSI | à faire | [`EXPLOITATION.md`](EXPLOITATION.md) §3–4 |
| 4 | **Serveur commun** : rôle `crucible_app`, schéma `crucible`, droits (M-1 à M-5 faites ; M-7 et M-8 fusionnées le 23/10/2026, Matrix#17) ; site du laboratoire 67 dans le référentiel (M-6, ouverte) | Matrix | M-6 ouverte | [`DEMANDES-MATRIX.md`](DEMANDES-MATRIX.md) |
| 5 | **Inscription Microsoft Entra** de Crucible (identifiant d’application, secret, adresse de retour) ; invités B2B pour EPC France (U-1) ; premier administrateur (`CRUCIBLE_ADMIN_EMAILS`) | DSI | à faire | `.env.example`, [`EXPLOITATION.md`](EXPLOITATION.md) §2 |
| 6 | **Comptes et rôles** : direction R&D, coordinateur (U-2), référent sécurité, responsables et techniciens par installation, chefs de projet, contact EPC France | Administrateur (DSI) puis direction R&D | après 5 | écran Utilisateurs et rôles |
| 7 | **Annonce** : à partir du premier jour, toute réservation des installations du pilote passe par Crucible (F-9) | Direction R&D | à faire | — |
| 8 | Connecteurs : jalons Keystone (K-2), absences Cursus (CU-1), contrôles Vigie (V-1) — **non bloquants** (saisie dans Crucible en attendant) | Keystone, Cursus, Vigie | K-2, CU-1 fusionnées ; V-1 en attente | écran Connecteurs |
| 9 | Assistant IA avec Claude — **non bloquant** (l’assistant répond par gabarits sans IA) | DSI (I-3) | en attente | [`DELIVERY-6.md`](DELIVERY-6.md) |

## 3. Mise en service (le jour J-5 environ)

1. Déployer avec `CRUCIBLE_SEED=production` (référentiel seul, aucune donnée de démonstration) et `CRUCIBLE_AUTH=entra` ;
   `npm run db:migrate`, puis `GET /api/health` = 200 ([`EXPLOITATION.md`](EXPLOITATION.md)). Sauvegardes : `CRUCIBLE_BACKUP_DIR`
   et le worker (`npm run worker`) ; e-mails : `CRUCIBLE_MAIL_TRANSPORT`.
2. L’administrateur crée les comptes et les rôles (prérequis 6).
3. La direction R&D saisit entités, sites, installations et projets (Administration) ; les responsables d’installation, les
   moyens, horaires, indisponibilités et contrôles ; le référent sécurité valide la règle « une zone du PDE à la fois »
   (PDE-ONE-ZONE) et les autres règles ; le coordinateur, les types d’essai, les substitutions validées, les personnes et
   leurs compétences.
4. Le coordinateur **importe l’historique** (Planning des moyens → Importer l’historique) sur les semaines de référence.
5. La direction R&D **définit le pilote** (écran Pilote) et vérifie que la liste de contrôle est entièrement cochée.

## 4. Pendant les 4 semaines

| Rythme | Qui | Quoi |
|---|---|---|
| chaque jour | techniciens | « Mon planning » : démarrer et terminer chaque essai (X-1) — c’est la mesure du réalisé |
| chaque jour | coordinateur | « À trancher » : propositions du moteur (passage de la nuit), conflits, aléas |
| chaque semaine | coordinateur, responsables, direction R&D | **revue du pilote** (30 min) : écran Pilote (écart avec la référence), plan de charge, réservations non tenues, demandes tardives, remarques des équipes |
| fin de semaine 2 | direction R&D | point d’étape : règles de priorité, délégation d’arbitrage (A-4), ajustements des règles d’exclusion avec le référent sécurité |
| fin de semaine 4 | direction R&D, responsable produit | **bilan** : indicateurs de réussite (P-10), décision de passer au déploiement général ([`PLAN.md`](PLAN.md)) |

Les remarques des équipes sont notées à la revue hebdomadaire ; une demande d’évolution passe par le responsable produit
(rien hors du cahier des charges sans son accord).

## 5. Critères de réussite proposés (P-10, à confirmer)

- **100 %** des réservations des installations du pilote passent par Crucible (aucune réservation hors outil).
- Occupation **réalisée avec préparation** du PDE en hausse par rapport à la référence ; **blocage** par la règle expliqué
  et suivi (c’est la contrainte de sécurité, pas un défaut).
- **Attente moyenne** entre la demande et l’essai stable ou en baisse ; **demandes tardives** en baisse.
- Conflits tranchés dans le délai de 2 jours ouvrés (A-6) ; aucune réservation confirmée déplacée sans décision tracée.
- Les responsables d’installation et les chefs de projet jugent l’outil utilisable (retour qualitatif à la revue de fin).

## 6. Après le pilote

Bilan écrit dans ce fichier ; décisions de déploiement général (autres moyens R&D, autres sites, socle partagé
`@epc2i/socle`) ; activation de Claude si la DSI l’a validé (I-3).
