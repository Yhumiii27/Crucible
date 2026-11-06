# Requêtes inter-applications
Format d'une entrée :
## [YYYY-MM-DD] <app demandeuse> → <cette app> — <titre court>
- Statut : OUVERTE | ACCEPTÉE | REFUSÉE | FAITE
- Demande : (quoi)
- Justification : (pourquoi, impact sur l'app demandeuse)
- Détails techniques : (tables, champs, types, endpoints, exemples)
- Validé par Guillaume le : (date)


## [2026-10-30] Matrix → Crucible — M-17 : accès entre outils décidés par Matrix (plus de copie de vue, écritures par API ou fonction `pub_`)
- Statut : FAITE (acceptée par le responsable produit le 31/10/2026 ; inventaire et règles : `docs/ECHANGES.md`, `CLAUDE.md` ; aucun accès non conforme)
- Demande : appliquer dans Crucible la décision M-17 de Matrix (`docs/decisions.md` et `docs/architecture-postgres.md` § 8 sexies du dépôt Matrix) :
  1. **Lire** les données d'un autre outil uniquement par ses vues `pub_` (R2), jamais par ses tables ;
  2. **Écrire** chez un autre outil uniquement par son API ou par une fonction `pub_` qu'il fournit (R4), jamais par `INSERT` / `UPDATE` / `DELETE` dans son schéma ;
  3. pour un **nouvel échange**, ne plus demander à Matrix de recopier une vue dans `partage/` : la migration de Crucible reste la seule définition de ses vues `pub_` (R3), et le besoin d'accès se déclare comme un lien du registre `matrix.liens` (R5) — en attendant l'API `POST /api/liens` (lot M17-4), par une entrée courte dans le `REQUESTS.md` de Matrix : lecteur, objet (`schéma.pub_…`), nature (`lecture` ou `execution`), justification ;
  4. pour une **écriture qu'un autre outil doit faire chez Crucible** : lui fournir une API, ou une fonction `pub_<verbe>_<objet>` créée par migration (`SECURITY DEFINER`, `SET search_path = <schéma>, pg_temp`, appelant identifié par `session_user`, règles et journal de Crucible appliqués, `REVOKE EXECUTE … FROM PUBLIC` ; § « Fonctions pub_ » de la note) ;
  5. reprendre ces règles dans le `CLAUDE.md` de Crucible et dans ses documents de demandes à Matrix, et faire l'inventaire de ses échanges (point de départ ci-dessous), en signalant à Matrix tout accès qui n'y serait pas conforme.
- Justification : décision du responsable produit du 30/10/2026 (M-17) : Matrix décide de chaque accès d'un outil aux données d'un autre, PostgreSQL l'applique. Les vues `pub_` restent les contrats de lecture, mais leur copie par Matrix (quatre étapes par échange, dont deux à la main) disparaît, et l'écriture entre outils devient possible sous le contrôle de Matrix sans contourner les règles métier du propriétaire.
- Détails techniques : relevé du 30/10/2026 sur `main` de Crucible (requêtes SQL vers d'autres schémas) : `cursus.pub_salaries`, `pub_absences`, `pub_titres_detenus`, `keystone.pub_projets`, `pub_jalons`, `vigie.pub_controles`, `pub_suspensions_essais`, `matrix.pub_sites`, `pub_filiales`, `codex.pub_documents`. Toutes ces lectures passent déjà par des vues `pub_` et aucune écriture directe dans un autre schéma n'a été trouvée : aucune correction urgente. Les vues, droits et fichiers de partage actuels restent en place pendant la transition (lots M17-1 à M17-5 côté Matrix) ; une vue `pub_` existante ne change pas.
- Validé par Guillaume le : 2026-10-30

## [2026-11-01] Matrix → Crucible — M-18 : Matrix définit vos vues `pub_` et décide de vos écritures croisées (plus de vue `pub_` dans vos migrations)
- Statut : FAITE (acceptée par le responsable produit le 01/11/2026 ; règles reprises dans `CLAUDE.md` et `docs/ECHANGES.md`, garde `src/server/db/pub-views-guard.test.ts` ; Matrix peut reprendre les 4 vues `pub_`)
- Demande : appliquer dans Crucible la décision M-18 de Matrix (`docs/decisions.md` et `docs/architecture-postgres.md` § 8 septies du dépôt Matrix), qui **remplace le point 3 de la demande M-17** du 30/10/2026 (« la migration reste la seule définition des vues `pub_` ») :
  1. **ne plus créer, modifier ni supprimer de vue `pub_` dans vos migrations** (les migrations déjà appliquées ne changent pas) : une nouvelle publication, ou une colonne de plus, se demande à Matrix, qui la définit dans son écran « Publications » (`matrix.publications`) et l'applique lui-même (rôle `matrix_gestion`). Votre migration crée les tables et colonnes ; la vue est celle de Matrix ;
  2. **avant de modifier ou de supprimer une colonne lue par une vue `pub_`**, le signaler à Matrix (entrée dans son `REQUESTS.md`) : la migration échouerait, la vue en dépend. Une colonne publiée ne se retire ni ne se renomme ; un changement incompatible passe par une vue `…_v2` ;
  3. **écritures que d'autres outils font chez vous** : votre API reste permise ; pour une écriture en SQL, fournir une fonction `pub_<verbe>_<objet>` créée par migration (`SECURITY DEFINER`, `SET search_path = <schéma>, pg_temp`, appelant identifié par `session_user`, vos règles et votre journal appliqués, `REVOKE EXECUTE … FROM PUBLIC`). Le droit de l'exécuter est un lien « écriture » décidé dans Matrix ; une fonction exécutable par tous est signalée en erreur par `droits.verifier()` ;
  4. **vos besoins chez les autres** (lecture d'une vue, exécution d'une fonction) se déclarent comme liens dans Matrix (écran « Liens entre outils » ou entrée courte dans son `REQUESTS.md` : outil, objet `schéma.pub_…`, nature `lecture` ou `execution`, justification), plus par une demande de copie de vue ;
  5. reprendre ces règles dans votre `CLAUDE.md`, puis passer cette entrée à FAITE : Matrix reprend alors vos vues `pub_` (`partage/14-reprise-publications.sql` : elles passent au rôle `matrix_gestion`, leurs lecteurs gardent leur droit).
- Justification : décision du responsable produit du 01/11/2026 (M-18) : « matrix [doit] être le seul outil qui permette d'administrer la base de données postgre […] c'est matrix qui doit avoir la main sur ce que chaque outil publie, lie, écrit ». Matrix est en place (lots P1 à P4 fusionnés le 01/11/2026 : rôle `matrix_gestion`, registre et écran « Publications », liens appliqués tout de suite, liens d'écriture). Tant que la reprise n'est pas faite, rien ne change pour Crucible ; après la reprise, une migration qui recréerait une vue `pub_` échouerait (« must be owner of view »), d'où le point 1 d'abord.
- Détails techniques : vues de Crucible reprises par Matrix : pub_journal, pub_moyens, pub_reservations, pub_occupation_hebdo (4 vues). Écritures reçues d'autres outils : aucune aujourd'hui. Une vue reprise garde son nom, ses colonnes, son commentaire et ses lecteurs ; seule sa propriété change. Contrôles : `droits.verifier()` (vue `pub_` encore à l'outil : attention, « pas encore reprise »). Pour un essai local (PGlite, base de démonstration), vos migrations anciennes continuent de créer les vues : seule une **nouvelle** migration ne doit plus en créer ni en modifier.
- Validé par Guillaume le : 2026-11-01


## [2026-11-05] Matrix → Crucible — M-19 · Fonction d'édition `crucible.pub_editer` : corriger les données de Crucible depuis Matrix, par vos règles
- Statut : FAITE (acceptée par le responsable produit le 06/11/2026 ; migration `drizzle/0030_pub_editer.sql`, règles dans `docs/ECHANGES.md` §5. Tables ouvertes : `entities`, `sites`, `facilities`, `resources` (sans les limites de réservation), `projects`, `people` (clé `id`), `test_types`, `skills` ; « retirer » archive (`active = false`, moyen `retired`), un site ne se retire pas ; un nom qui suit un autre outil (projet lié à Keystone, site ou entité reliés à Matrix, personne avec matricule) est refusé ; tout le reste fermé (réservations, journal, tables en ajout seul, comptes et rôles, jetons, règles d'exclusion). Journal : `crucible.audit_entries`, zone « Administration », auteur « <p_par> (Matrix) », motif. La DSI peut autoriser le lien d'écriture `matrix_app` → `crucible.pub_editer`)
- Demande : fournir, par une migration de Crucible, la fonction
  `crucible.pub_editer(p_table text, p_action text, p_cle jsonb, p_valeurs jsonb, p_par text, p_motif text) RETURNS jsonb`
  (`SECURITY DEFINER`, `SET search_path = crucible, pg_temp`, `REVOKE EXECUTE … FROM PUBLIC`), qui ajoute, corrige ou retire une ligne
  d'une table de Crucible en appliquant vos règles et votre journal :
  - `p_action` = `ajouter` | `corriger` | `retirer` (un retrait peut être un archivage) ; `p_cle` = clé primaire de la ligne
    (null pour `ajouter`) ; `p_valeurs` = colonnes à écrire (null pour `retirer`) ;
  - `p_par` = nom de la personne connectée à Matrix (Microsoft Entra ID, rôle Administrateur) ; `p_motif` = motif saisi
    (obligatoire) ;
  - refus par `RAISE EXCEPTION` (message montré tel quel dans Matrix) ; la fonction renvoie la ligne après modification,
    sans colonne sensible ;
  - elle refuse les tables que Crucible ne veut pas ouvrir et toute colonne de `droits.colonnes_sensibles` (Matrix ne les
    transmet jamais, mais la fonction ne doit pas en dépendre) ;
  - règle propre à Crucible à respecter : journal d'audit en ajout seul ; aucune réservation confirmée ne bouge sans décision humaine tracée (la fonction refuse ces tables ou applique cette règle).
  Une fonction par table (`crucible.pub_editer_<table>`, mêmes paramètres sans `p_table`) reste possible et passe avant la
  générique. Une fois la migration passée, passer cette entrée à FAITE : la DSI autorise alors le lien d'écriture dans Matrix.
- Justification : décision M-19 du 05/11/2026 (responsable produit) : « pour le moment, l'admin IT peut modifier toutes les
  données à l'exception des données sensibles RGPD », **par les outils** : Matrix n'écrit jamais lui-même dans vos tables
  (M-18) ; la DSI corrige depuis la visionneuse de Matrix, Crucible garde ses règles et son journal.
- Détails techniques : convention complète et exemple dans `docs/edition-par-les-outils.md` du dépôt Matrix. Le droit
  d'exécution est un lien « écriture » `matrix_app` → `crucible.pub_editer`, décidé dans Matrix (« Liens entre outils ») et posé
  par `droits.accorder_execution` ; `droits.verifier()` signale une fonction `pub_` exécutable par tous ou sans
  `search_path` fixé. Rien ne change pour Crucible tant que la fonction n'existe pas : la visionneuse reste en lecture seule.
- Validé par Guillaume le : 2026-11-05
