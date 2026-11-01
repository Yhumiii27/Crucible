# Livraison 8 — lecture des autres outils (CR-060)

> 31 oct. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « lance le prochain point du reste à
> faire », choix CR-060 (connecteurs). Relecture du questionnaire avant la livraison : aucune nouvelle réponse. Nouvelle
> question **X-10** ([`DECISIONS.md`](DECISIONS.md) §10), réponse par défaut appliquée, à confirmer. Décision M-17 de Matrix
> respectée : lecture par les seules vues `pub_` ([`ECHANGES.md`](ECHANGES.md)).

## 1. Ce qui n’est plus saisi deux fois

Dès qu’une vue est publiée par son outil et accordée à Crucible par Matrix, Crucible la lit **toutes les heures** (tâche
`connectors-read` du worker) ou à la demande (**Lire maintenant**, écran Connecteurs : administrateur, coordinateur,
direction R&D). Ce qui est lu est écrit dans les tables de Crucible avec sa source : les règles, le moteur et les écrans ne
lisent qu’un endroit. Une ligne lue se modifie **dans son outil**, jamais dans Crucible.

| Vue | Devient | Règles |
|---|---|---|
| `keystone.pub_jalons` (K-2) | jalons des projets (source Keystone) | projets R&D rattachés à un projet Keystone (`projects.keystone_code`) ; date = fin de l’activité liée (`date_fin_activite`) ; un jalon sans date est écarté (les mois depuis le début du projet ne se datent pas : `pub_projets` ne porte pas de date de début) ; criticité « interne » ; un jalon retiré de Keystone est retiré, sauf si un besoin le sert encore (il garde sa dernière date) ; modification refusée dans Crucible |
| `cursus.pub_absences` (CU-1) | absences des personnes (source Cursus) | personnes de Crucible ayant un matricule ; absences validées **et demandées** (on ne planifie pas sur un congé en attente) ; annulées écartées ; une absence qui disparaît de Cursus disparaît de Crucible ; les absences saisies dans Crucible restent ; retrait refusé dans Crucible (étiquette « Cursus » sur l’écran Personnes) |
| `vigie.pub_controles` (V-1, D23) | contrôles périodiques des moyens (source Vigie) | moyen dont le code est l’`equipement_code` du contrôle ; libellé = type de contrôle, dernière date et périodicité de Vigie ; un contrôle saisi dans Crucible avec le même libellé devient celui de Vigie ; un contrôle archivé ou retiré ne s’applique plus ; sans dernière date ou périodicité : écarté ; enregistrement refusé dans Crucible (« enregistrer dans Vigie »), étiquette « Vigie » sur l’onglet Contrôles |

Une vue absente ou non accordée est un **état**, pas une erreur : rien n’est lu ni changé, la saisie dans Crucible continue.
Chaque lecture qui change quelque chose est écrite au journal (objet = la vue, compteurs ajoutés / modifiés / retirés).

## 1 bis. État des références Codex (1er nov. 2026)

Suite de CR-060 (« lance le prochain point », choix « fin de CR-060 »). Les références Codex restent saisies dans Crucible
(Codex héberge tous les documents) ; dès que `codex.pub_documents` est lisible, Crucible lit **à l’affichage** (rien n’est
copié) le document que chaque référence désigne, par son identifiant ou un ancien numéro (casse et espaces ignorés), et
affiche à côté :

- « rév. B en vigueur » quand le document a une révision en vigueur ;
- un avertissement sinon : **Inconnu de Codex**, **Obsolète dans Codex**, **Archivé dans Codex**, **Aucune révision en
  vigueur dans Codex**.

Où : protocole des besoins d’essai (Mes besoins, fiche projet), rapport des réservations terminées (fiche projet), analyse
de risque des règles d’exclusion et justification des substitutions (Règles). Jamais le titre du document : sa
confidentialité est celle de Codex (D10), la référence suffit. Sans la vue, la référence seule, comme avant. Règles pures
`src/domain/codex.ts`, lecture `src/server/dal/codex.ts`, affichage `src/components/app/CodexRef.tsx` ; 4 tests de plus
(362 au total).

## 2. Ce qui reste

- `vigie.pub_suspensions_essais` (V-2) : pas encore publiée par Vigie.
- `keystone.pub_projets`, `cursus.pub_salaries`, `matrix.pub_sites`, `pub_filiales` : le rattachement reste saisi
  (code Keystone d’un projet, matricule d’une personne) ; leur lecture viendra avec les données D-1 à D-11.
- Sur le serveur commun, les vues doivent être accordées à `crucible_app` par Matrix (registre `matrix.liens`, M-17) : c’est
  déjà le cas dans `partage/90-droits.sql` pour les trois vues lues.

## 3. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **358 tests** sur PostgreSQL 16, dont 9 nouveaux
  (`src/server/integrations/connectors.test.ts`) : vue absente ou non accordée, jalons ajoutés, modifiés, retirés, gardés
  quand un besoin les sert, jalon non daté écarté ; absences validées et demandées lues, annulées retirées, absence saisie
  gardée ; contrôles de Vigie repris, contrôle saisi devenu celui de Vigie, archivé désactivé ; refus de modifier dans
  Crucible ce qui vient d’un autre outil ; droits de l’action « Lire maintenant » et ses comptes rendus.
- Migration `0014_connectors_read` (générée) : `inspections.source`, `inspections.source_ref`.
