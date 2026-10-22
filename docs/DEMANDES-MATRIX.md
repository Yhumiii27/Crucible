# Demandes de Crucible à Matrix (socle du serveur PostgreSQL commun)

> 22 oct. 2026. Même démarche que pour Arche (décision M-07 de Matrix). Crucible ne modifie jamais le dépôt Matrix : ces
> demandes sont à transmettre au chat Matrix par le responsable produit. Relevé du dépôt `Yhumiii27/Matrix` au commit
> `7698799`. **État au 22/10/2026** (`REQUESTS.md` de Matrix) : M-1 à M-5 faites, M-6 ouverte (localisation des sites
> attendue, P-1) ; M-7 rédigée avec la livraison 3, **à transmettre après validation** du responsable produit. Proposition (T-1) : **PostgreSQL uniquement**, schéma `crucible`, rôle `crucible_app`, tables déclarées dans
> le schéma (`crucible.table(…)`), verrous `hashtext('crucible.migrations')` et `hashtext('crucible.ecritures')`, journal
> `crucible.__drizzle_migrations`.

| # | Demande | Fichier Matrix |
|---|---|---|
| M-1 | Rôle `crucible_app` (`CRUCIBLE_APP_PASSWORD`, SCRAM, accordé à `matrix_admin`, `CONNECT` sur `epc2i`) | `infra/postgres/init/01-base-et-roles.sql` |
| M-2 | Schéma `crucible` propriété de `crucible_app`, `search_path`, délai d’inactivité en transaction | `init/02-schemas.sql` |
| M-3 | Ajouter `crucible` / `crucible_app` partout où les outils sont énumérés (droits par défaut, contraintes de nom des vues partagées, `droits.verifier()`) ; colonnes sensibles : `crucible.users.email`, `crucible.users.entra_object_id` | `init/03-droits.sql` |
| M-4 | Fichier de partage `partage/80-crucible.sql` (copie des vues `pub_` de Crucible, fourni avec la livraison qui les crée) et droits des lecteurs : `crucible_app` lit `keystone.pub_projets` (puis `pub_jalons`), `cursus.pub_salaries`, `pub_titres`, `pub_titres_detenus` (puis `pub_absences`), `codex.pub_documents`, `pub_revisions_document`, `matrix.pub_sites`, `pub_organigramme` ; Keystone et Vigie lisent `crucible.pub_reservations`, `pub_moyens` | `partage/80-crucible.sql`, `partage/90-droits.sql` |
| M-5 | Journal unifié : ajouter `crucible.pub_journal` ; déclaration de l’application `crucible` (`/api/declarations`), catalogue et collecteur | `partage/95-matrix-journal-unifie.sql`, `data/catalogue.json`, `outils/collecteur.mjs` |
| M-6 | Référentiel des sites : ajouter le site du **laboratoire 67** et celui du **PDE** s’ils ne sont pas Lyon, Le Havre ou Marseille (P-1) ; entité **EPC France** (niveau société / filiale, D21) | `data/referentiels.json`, `partage/10-matrix-referentiels.sql` |
| M-7 | (livraison 3) Recopier dans `partage/80-crucible.sql` les vues `crucible.pub_moyens` et `crucible.pub_reservations` créées par la migration `0005_share_resources` de Crucible (règle P-02 : copie à l’identique) ; droits déjà posés dans `90-droits.sql` (Keystone, Vigie, Matrix) | `partage/80-crucible.sql` |
