# Demandes de Crucible à Matrix (socle du serveur PostgreSQL commun)

> 22 oct. 2026. Même démarche que pour Arche (décision M-07 de Matrix). Crucible ne modifie jamais le dépôt Matrix : ces
> demandes sont à transmettre au chat Matrix par le responsable produit. Relevé du dépôt `Yhumiii27/Matrix` au commit
> `7698799`. **État au 22/10/2026** (`REQUESTS.md` de Matrix) : M-1 à M-5 faites, M-6 ouverte (localisation des sites
> attendue, P-1) ; M-7 rédigée avec la livraison 3, validée et **transmise** le 22/10/2026 (Yhumiii27/Matrix#17) ; **fusionnée le 23/10/2026**. Proposition (T-1) : **PostgreSQL uniquement**, schéma `crucible`, rôle `crucible_app`, tables déclarées dans
> le schéma (`crucible.table(…)`), verrous `hashtext('crucible.migrations')` et `hashtext('crucible.ecritures')`, journal
> `crucible.__drizzle_migrations`.

> **Depuis M-17 (30/10/2026, appliquée par Crucible le 31/10/2026, [`ECHANGES.md`](ECHANGES.md))** : plus de demande de
> copie de vue. Les copies de M-4, M-7 et M-8 dans `partage/80-crucible.sql` seront retirées par le lot M17-3 de Matrix ;
> les vues restent définies par les seules migrations de Crucible. Un nouvel échange se déclare comme un **lien** du
> registre `matrix.liens` (lecteur, objet `schéma.pub_…`, nature `lecture` ou `execution`, justification) : par
> `POST /api/liens` une fois livré (M17-4), d’ici là par une entrée courte dans le `REQUESTS.md` de Matrix.

> **Depuis M-18 (01/11/2026, appliquée par Crucible le même jour)** : Matrix définit et possède les vues `pub_` de Crucible
> (écran « Publications ») ; une nouvelle vue ou une colonne de plus se demande à Matrix, et toute suppression ou
> renommage d’une colonne d’une table publiée lui est signalé avant la migration.

| # | Demande | Fichier Matrix |
|---|---|---|
| M-1 | Rôle `crucible_app` (`CRUCIBLE_APP_PASSWORD`, SCRAM, accordé à `matrix_admin`, `CONNECT` sur `epc2i`) | `infra/postgres/init/01-base-et-roles.sql` |
| M-2 | Schéma `crucible` propriété de `crucible_app`, `search_path`, délai d’inactivité en transaction | `init/02-schemas.sql` |
| M-3 | Ajouter `crucible` / `crucible_app` partout où les outils sont énumérés (droits par défaut, contraintes de nom des vues partagées, `droits.verifier()`) ; colonnes sensibles : `crucible.users.email`, `crucible.users.entra_object_id` | `init/03-droits.sql` |
| M-4 | Fichier de partage `partage/80-crucible.sql` (copie des vues `pub_` de Crucible, fourni avec la livraison qui les crée) et droits des lecteurs : `crucible_app` lit `keystone.pub_projets` (puis `pub_jalons`), `cursus.pub_salaries`, `pub_titres`, `pub_titres_detenus` (puis `pub_absences`), `codex.pub_documents`, `pub_revisions_document`, `matrix.pub_sites`, `pub_organigramme` ; Keystone et Vigie lisent `crucible.pub_reservations`, `pub_moyens` | `partage/80-crucible.sql`, `partage/90-droits.sql` |
| M-5 | Journal unifié : ajouter `crucible.pub_journal` ; déclaration de l’application `crucible` (`/api/declarations`), catalogue et collecteur | `partage/95-matrix-journal-unifie.sql`, `data/catalogue.json`, `outils/collecteur.mjs` |
| M-6 | Référentiel des sites : ajouter le site du **laboratoire 67** et celui du **PDE** s’ils ne sont pas Lyon, Le Havre ou Marseille (P-1) ; entité **EPC France** (niveau société / filiale, D21) | `data/referentiels.json`, `partage/10-matrix-referentiels.sql` |
| M-7 | (livraison 3) Recopier dans `partage/80-crucible.sql` les vues `crucible.pub_moyens` et `crucible.pub_reservations` créées par la migration `0005_share_resources` de Crucible (règle P-02 : copie à l’identique) ; droits déjà posés dans `90-droits.sql` (Keystone, Vigie, Matrix) | `partage/80-crucible.sql` |
| M-8 | (livraison 5) Recopier dans `partage/80-crucible.sql` la vue `crucible.pub_occupation_hebdo` créée par la migration `0009_share_weekly` de Crucible (instantanés hebdomadaires d’occupation par moyen, X-4 ; règle P-02 : copie à l’identique) et accorder sa lecture à `matrix_app` dans `90-droits.sql`. validée le 23/10/2026 et **transmise** (`REQUESTS.md` de Matrix, Yhumiii27/Matrix#17, avec M-7) ; **fusionnée le 23/10/2026** | `partage/80-crucible.sql`, `partage/90-droits.sql` |
