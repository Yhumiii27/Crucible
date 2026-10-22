# Demandes de Crucible à Keystone

> 22 oct. 2026. Crucible ne modifie jamais le dépôt Keystone : ces demandes sont à transmettre par le responsable produit.
> Relevé du dépôt `Yhumiii27/Keystone` au commit `a8ba6df`.

| # | Demande | Pourquoi | Bloque | Décision liée |
|---|---|---|---|---|
| K-1 | Accorder la lecture de `pub_projets` à `crucible_app` (via Matrix, `partage/90-droits.sql`) | rattacher une demande d’essai à un projet Keystone existant | L3 | S-1 |
| K-2 | Publier une vue **`pub_jalons`** : `projet_code`, `jalon_id`, `nom`, `mois_reference`, `mois_prevu`, `statut`, `activite_code`, `date_activite_fin` (fin au plus tôt de l’activité liée, si datée), `maj_le` | lire les échéances des projets dans Keystone pour la rétro-planification des essais | L3 | S-2 |
| K-3 | Si les projets R&D sont des projets internes de Keystone : une nature ou une étiquette « R&D » lisible dans `pub_projets` (colonne en fin de vue, ex. `categorie`) | filtrer les projets R&D | L3 | S-1 |
| K-4 | (facultatif) Lire `crucible.pub_reservations` pour afficher les essais planifiés dans le planning d’un projet | visibilité côté projet | après L3 | S-5 |
