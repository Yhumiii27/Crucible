# Livraison 4 — proposition et arbitrage

> 22 oct. 2026, branche `claude/lucid-dirac-7bdq6x`. Plan : [`PLAN.md`](PLAN.md) (L4). Lancée à la demande du responsable
> produit. Questionnaire relu avant la livraison : aucune nouvelle réponse (A-1, A-2, A-4, A-5, A-6, F-2, F-3, F-4, F-7, R-4,
> R-8, S-3, T-3 confirmés par défaut). Les données réelles (D-4 substitutions, D-6 personnes) ne sont pas encore fournies :
> tout est démontré sur le jeu de démonstration.

## 1. Ce qui est livré

| Domaine | Contenu | Où |
|---|---|---|
| Personnes et compétences (F-7, S-3) | personnes qui réalisent les essais (entité, matricule Cursus, installations), compétences avec leur dernier jour d’usage, absences ; tenues par le coordinateur et les responsables des installations où elles travaillent ; catalogue des compétences (coordinateur, direction R&D), chacune rattachable à un titre Cursus | `src/domain/people.ts`, `/people` |
| Lecture de Cursus (S-3) | « Lire les titres dans Cursus » : quand `cursus.pub_titres_detenus` est lisible, les titres des personnes qui ont un matricule donnent leurs compétences et leur date de fin (source `cursus`) ; sinon un message dit que la vue n’est pas encore accordée | `syncCursusSkillsAction` |
| Exigences des types d’essai | compétences demandées (et combien de personnes) et équipements mobiles de chaque type d’essai | `/rules` |
| Équipements mobiles (R-8) | caméra rapide, chaîne d’acquisition… tenus par une installation, réservés avec l’essai (une seule réservation à la fois) | fiche `/facilities/[code]` |
| Substitutions (R-4, R-11) | un type d’essai sur un autre moyen : conditions, référence Codex de la justification, référent technique nommé, matières dangereuses ; proposée par un responsable, **validée par le responsable de l’installation d’accueil**, et par le **référent sécurité** pour les matières dangereuses ; retrait motivé. Le moteur ne propose **qu’une substitution validée** | `/rules`, `substitutions` |
| Règles de priorité (A-1, A-2) | ordre des critères — sécurité et réglementaire, engagement contractuel, jalon critique (plus de marge), classe du projet, marge, ancienneté — **versionné**, publié par la direction R&D ; chaque proposition et chaque conflit cite sa version | `src/domain/priority.ts`, `/rules` |
| Moteur de proposition (T-3, F-2, F-3, F-14) | heuristique **déterministe** : sert les besoins ouverts dans l’ordre des règles (et des arbitrages), place chacun au plus tôt sur un bloc de demi-journées qui passe **toutes les contraintes dures** (horaires, état, indisponibilités, contrôles, capacité, règles d’exclusion), avec des personnes habilitées, présentes et libres, et ses équipements ; moyen demandé, puis substitution validée, sinon en retard ; **ne confirme jamais rien** (F-3) ; à la demande (direction R&D, coordinateur) et chaque jour (tâche `plan-nightly`) ; besoins non placés avec leur motif (contrôle à renouveler, personne habilitée, équipement, pas de place) | `src/domain/engine.ts`, `src/server/planning/engine-run.ts`, `/propose` |
| Acceptation des propositions | par lot, par un responsable de l’installation de chaque proposition : chaque proposition devient une **réservation confirmée** de son besoin, avec ses personnes et ses équipements, **après un nouveau contrôle** de toutes les contraintes (une personne devenue absente refuse la proposition, avec le motif) ; refus d’une proposition ; tout est audité | `acceptProposalsAction` |
| Fiches de conflit (spec 03 §5, A-9) | quand un besoin est repoussé en retard par des besoins servis avant lui sur son moyen ou sa règle d’exclusion : besoins en concurrence, options (« comme proposé », « ce besoin d’abord ») avec leurs conséquences par besoin (moyen, créneau, substitution, jours ouvrés de retard), **règle citée avec son rang**, recommandation selon l’ordre des objectifs (F-2), décideur, échéance de 2 jours ouvrés (A-6) | `src/domain/conflicts.ts`, `/conflicts` |
| Arbitrage (A-4, A-6) | le **coordinateur** tranche si aucune option ne retarde un besoin critique, sinon la **direction R&D** ; option, règle invoquée, motif ; une décision n’est **jamais modifiée** (table en ajout seul, déclencheur) : le passage suivant sert les besoins dans l’ordre décidé ; **veto du référent sécurité** (la fiche est à trancher à nouveau) ; échéance dépassée signalée | `decideConflictAction`, `vetoConflictAction`, `drizzle/0007_arbitrations_append_only.sql` |
| Mes besoins | créneaux proposés par le moteur pour les besoins de mes projets | `/my/needs` |

Jeu de démonstration : trois compétences (pyrotechnicien habilité, technicien d’atelier, technicien de laboratoire), quatre
personnes dont une absente fin novembre, une caméra rapide et une chaîne d’acquisition (exigées par les tirs), une
substitution **validée** (essais de formulation dans la salle d’analyse du laboratoire 67, matières dangereuses : avis
sécurité donné) et une **proposée** (traction à l’atelier mécanique), les règles de priorité v1 et un premier passage du
moteur (`R-2026-0001`). Résultat : les essais de formulation de Cassiopée (dossier réglementaire, rang 1) passent d’abord au
PDE ; l’usinage de Vega est repoussé d’un jour ouvré ; la fiche `C-2026-0001` recommande de **servir Vega d’abord et de passer
Cassiopée sur sa substitution validée** — personne n’est alors en retard ; le coordinateur décide (aucun besoin critique
retardé). La campagne de tirs d’Orion n’est pas placée : le contrôle électrique du pilote arrive à échéance le 16/11 (R-10).

## 2. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur.
- `npm test` : **271 tests** sur PostgreSQL 16, dont les règles pures du moteur (ordre de service, critère qui départage et
  son rang, placement au plus tôt avec personnes et équipement, substitution validée seulement, contrôle échu, habilitation
  expirée ou absence, fermeture de fin d’année, fiche de conflit et recommandation) et un **test par propriétés sur 60
  scénarios aléatoires** : chaque proposition passe toutes les contraintes dures contre les réservations et les autres
  propositions, n’utilise que son moyen ou une substitution validée, et n’affecte jamais une personne ou un équipement à deux
  essais en même temps. 11 tests d’intégration : le conflit de la démo, qui lance le moteur, qui décide, l’ordre décidé appliqué
  au passage suivant, la décision qui ne se modifie pas, l’acceptation par le responsable de l’installation (et pas d’une autre),
  le refus d’une proposition devenue impossible, le veto, les règles de priorité, la substitution, les personnes, la lecture de
  Cursus (vue simulée) et l’acceptation de toutes les propositions d’un passage sans aucun refus.
- `npm run db:migrate` sur une base neuve (migrations `0006_people_engine`, `0007_arbitrations_append_only`), `npm run build`,
  `next start` et `npm run test:smoke` : **39 contrôles HTTP** passent ; aucune page en erreur pour les neuf profils.

## 3. Choix appliqués, à confirmer (questionnaire)

- **R-11** : le référent technique est nommé sur la substitution ; la validation dans Crucible est faite par le responsable de
  l’installation d’accueil (et la sécurité pour les matières dangereuses).
- **A-9** : options « comme proposé » et « ce besoin d’abord » ; recommandation selon F-2 ; une décision fixe l’ordre des
  passages suivants, un veto l’annule.
- **F-14** : un besoin est placé en un seul bloc de demi-journées ; personnes choisies par ordre alphabétique parmi les
  habilitées ; passage quotidien.

## 4. Limites et suites

- Pas encore de découpage d’un besoin en plusieurs créneaux ni d’option « heures étendues » (A-9) ; la stabilité (F-2, rang 4)
  n’entre pas dans la recommandation tant que le moteur ne déplace rien (replanification : livraison 5).
- Les absences sont saisies dans Crucible en attendant `cursus.pub_absences` (CU-1, transmise le 22/10).
- Les demandes de créneau manuelles ne réservent pas d’équipement mobile ni de personnes : elles passent par le moteur.
- Les notifications (proposition, décision, relance d’arbitrage A-6) arrivent avec la livraison 5 (F-8).
