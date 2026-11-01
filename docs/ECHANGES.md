# Échanges de Crucible avec les autres outils (décisions M-17 et M-18 de Matrix)

> 31 oct. 2026. Demande de Matrix du 30/10/2026 (`REQUESTS.md`), acceptée par le responsable produit le 31/10/2026.
> Décision M-17 : Matrix décide de chaque accès d’un outil aux données d’un autre et PostgreSQL l’applique (dépôt Matrix,
> `docs/decisions.md` et `docs/architecture-postgres.md` § 8 sexies). Relevé fait sur `main` de Crucible (`c3da68f`) :
> requêtes SQL vers d’autres schémas, appels HTTP vers les autres outils, vues et fonctions des migrations.
>
> **1er nov. 2026 — M-18** (demande de Matrix du même jour, acceptée par le responsable produit) : Matrix **définit et
> possède** les vues `pub_` de Crucible (écran « Publications », `matrix.publications`, rôle `matrix_gestion`) et décide des
> écritures croisées ; cela remplace R3 ci-dessous (« la migration reste la seule définition »).

## 1. Règles appliquées par Crucible

| # | Règle | Dans Crucible |
|---|---|---|
| R1 | Chaque table a un seul outil écrivain, son propriétaire. | `crucible_app` n’écrit que dans le schéma `crucible`. |
| R2 | Lecture chez un autre outil par ses vues `pub_` seulement, jamais par ses tables. | Toutes les lectures du § 2 sont des vues `pub_`. |
| R3 (M-18) | Matrix définit et possède les vues `pub_` de chaque outil ; une migration crée les tables et les colonnes, jamais une vue `pub_`. | Les migrations `0002`, `0005` et `0009` qui ont créé les vues restent telles qu’appliquées (une base locale neuve les a encore) ; aucune nouvelle migration ne crée, remplace, modifie ni supprime de vue `pub_`, ni ne supprime ou renomme une colonne d’une table lue par une vue publiée sans prévenir Matrix — contrôlé par `src/server/db/pub-views-guard.test.ts`. Une nouvelle publication, ou une colonne de plus, se demande à Matrix. |
| R4 | Écriture chez un autre outil par son API ou par une fonction `pub_` qu’il fournit, jamais par `INSERT`, `UPDATE` ou `DELETE`. | Seule écriture aujourd’hui : la déclaration du schéma à Matrix, par son API (§ 3). |
| R5 | Le registre `matrix.liens` est la seule source des droits entre outils. | Un nouveau besoin se déclare comme un lien (§ 5), plus comme une copie de vue. |
| R6 | Les référentiels de Matrix (sites, filiales, zones, organigramme) s’écrivent par les fonctions de Matrix. | Crucible ne crée ni site ni entité chez Matrix ; s’il en a besoin, il passera par `matrix.pub_creer_…`. |

## 2. Ce que Crucible lit chez les autres

Lectures déclarées dans `src/config/connectors.ts` (écran **Connecteurs**, `/admin/connectors`, qui montre si chaque vue est
accordée par `has_table_privilege`). Toutes les vues sont accordées à `crucible_app` par `partage/90-droits.sql` de Matrix.

| Vue | Outil | Usage | Lue par le code aujourd’hui | Demande d’origine |
|---|---|---|---|---|
| `keystone.pub_projets` | Keystone | projet Keystone rattaché à un projet R&D | prévu (écran Connecteurs) | K-1, S-1 |
| `keystone.pub_jalons` | Keystone | jalons lus au lieu d’être saisis | **oui**, toutes les heures (livraison 8, `src/server/integrations/connectors.ts`) | K-2 |
| `cursus.pub_salaries` | Cursus | personnes qui conduisent les essais | prévu | CU-2, S-3 |
| `cursus.pub_titres_detenus` | Cursus | habilitations des opérateurs | **oui** (`src/features/planning/actions.ts`, lecture des titres) | CU-2, S-3 |
| `cursus.pub_absences` | Cursus | absences des opérateurs, sans motif | **oui**, toutes les heures (livraison 8) | CU-1 |
| `codex.pub_documents` | Codex | protocoles et rapports référencés | **oui**, à l’affichage (état et révision en vigueur, jamais le titre ; `src/server/dal/codex.ts`) | CX-1, S-6 |
| `vigie.pub_controles` | Vigie | contrôles réglementaires des moyens | **oui**, toutes les heures (livraison 8) | V-1, S-4 |
| `vigie.pub_suspensions_essais` | Vigie | essais suspendus pendant une intervention extérieure | prévu | V-2, R-7 |
| `matrix.pub_sites` | Matrix | sites des installations | prévu | M-6 |
| `matrix.pub_filiales` | Matrix | entités qui partagent les installations | prévu | M-6 |

Accordées par Matrix sans lecture prévue dans le code à ce jour : `cursus.pub_titres`, `codex.pub_revisions_document`,
`codex.pub_programmes_recherche` (CX-2), `matrix.pub_organigramme`. Elles restent demandées : elles serviront aux
lectures prévues ci-dessus (libellé des titres, révision d’un document, programme de recherche, organisation).

## 3. Ce que Crucible écrit chez les autres

| Écriture | Chez | Comment | Conforme |
|---|---|---|---|
| Déclaration du schéma de Crucible (tables, colonnes) après les migrations | Matrix | API `POST /api/declarations` (`src/server/integrations/matrix/`, `MATRIX_URL`, `MATRIX_TOKEN`) | oui (R4, API) |
| (plus tard, CX-3) dépôt d’un rapport d’essai depuis une réservation | Codex | API de dépôt de Codex (fichier : jamais une fonction `pub_`) | oui (R4, API) |

Aucune écriture SQL dans un autre schéma (aucun `INSERT`, `UPDATE`, `DELETE` hors `crucible`). Le serveur l’interdit
d’ailleurs : `crucible_app` n’a aucun droit d’écriture ailleurs.

## 4. Ce que les autres lisent chez Crucible

| Vue (créée par la migration de Crucible, reprise par Matrix, M-18) | Lecteurs (registre de Matrix) | Contenu |
|---|---|---|
| `crucible.pub_journal` (`0002_share_journal`) | Matrix | journal d’audit (D18) |
| `crucible.pub_moyens` (`0005_share_resources`) | Keystone, Vigie, Matrix | moyens d’essai |
| `crucible.pub_reservations` (`0005_share_resources`) | Keystone, Vigie, Matrix | réservations ; projets confidentiels masqués (S-7) |
| `crucible.pub_occupation_hebdo` (`0009_share_weekly`) | Matrix | instantanés hebdomadaires d’occupation (X-4) |

Ce sont des contrats : jamais de colonne retirée, renommée, déplacée ou de type changé ; une nouvelle colonne va en fin de
vue, sinon une vue `_v2`. Depuis M-18, Matrix les reprend (`partage/14-reprise-publications.sql` : propriétaire
`matrix_gestion`, mêmes nom, colonnes, commentaire et lecteurs) et en est la seule définition. Tables qu’elles lisent :
`audit_entries`, `bookings`, `resources`, `facilities`, `projects`, `weekly_snapshots` — avant de supprimer ou renommer une
de leurs colonnes, une entrée dans le `REQUESTS.md` de Matrix (la migration échouerait : la vue en dépend).

## 5. Ce que les autres écrivent chez Crucible

Rien aujourd’hui : aucun outil n’a demandé à écrire chez Crucible. Si un outil en a besoin (par exemple Keystone qui
demanderait un essai, ou Vigie qui suspendrait un moyen), Crucible lui fournira :

- une **API** quand l’écriture demande un fichier, un appel à un service externe ou plus d’une transaction ;
- sinon une **fonction `crucible.pub_<verbe>_<objet>`**, créée par une migration de Crucible : propriétaire `crucible_app`,
  `SECURITY DEFINER`, `SET search_path = crucible, pg_temp`, sans SQL dynamique ; appelant identifié par `session_user`
  (`keystone_app`…) ; arguments et règles de Crucible contrôlés (droits, contraintes dures de `checkBooking`, verrou
  d’écriture `hashtext('crucible.ecritures')`) ; journal d’audit de Crucible au nom de l’outil appelant ; erreur métier =
  exception d’un code stable (`SQLSTATE` de la classe `P0`) ; `REVOKE EXECUTE … FROM PUBLIC` dans la même migration
  (seul le registre de Matrix accorde `EXECUTE`). Signature jamais changée : une nouvelle version prend un nouveau nom
  (`…_v2`). Règle « le moteur propose, une personne décide » : une fonction `pub_` ne confirme ni ne déplace jamais une
  réservation confirmée.

## 6. Un nouvel échange

1. Une **vue** `pub_` se demande à Matrix, qui la définit (M-18) ; une **fonction** `pub_` d’écriture reste créée par la
   migration de l’outil qui reçoit l’écriture (si c’est Crucible : contrat du § 5), son exécution est un lien « écriture »
   décidé dans Matrix.
2. Le lecteur déclare le **lien** dans le registre de Matrix : `POST /api/liens` avec le jeton de l’outil quand Matrix
   l’aura livré (lot M17-4) ; en attendant, une entrée courte dans le `REQUESTS.md` de Matrix : **lecteur**, **objet**
   (`schéma.pub_…`), **nature** (`lecture` ou `execution`), **justification** — toujours après la note détaillée et le
   « validé » du responsable produit.
3. Plus de demande de copie de vue dans `partage/`.
4. Matrix décide le lien dans son écran « Liens entre outils » ; le droit est posé par Matrix.

## 7. Constat pour Matrix

Aucun accès non conforme : toutes les lectures passent par des vues `pub_`, la seule écriture chez un autre outil passe par
une API. Rien à corriger dans Crucible pendant la transition (lots M17-1 à M17-5 de Matrix). M-18 : Crucible a repris les
règles (1er nov. 2026) ; Matrix peut reprendre ses 4 vues `pub_`.
