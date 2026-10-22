# Demandes de Crucible à Codex

> 22 oct. 2026. Crucible ne stocke aucun fichier (S-6) : il garde des références Codex. Crucible ne modifie jamais le dépôt
> Codex : ces demandes sont à transmettre par le responsable produit.

| # | Demande | Pourquoi | Bloque | Décision liée |
|---|---|---|---|---|
| CX-1 | Accorder la lecture de `pub_documents` et `pub_revisions_document` à `crucible_app` (via Matrix) | afficher l’état et la révision des documents référencés (protocole, mode opératoire, analyse de risque, rapport) | L3 | S-6 |
| CX-2 | Confirmer que les documents d’essai d’un projet R&D se rattachent au **programme de recherche** (`research`, `program_code`) ou au projet Keystone, et publier la liste des programmes (`pub_programmes_recherche` : `code`, `libelle`, `responsable_matricule`, `actif`) | relier les projets de Crucible aux programmes de recherche | L3 | S-1, S-6 |
| CX-3 | (plus tard) API de dépôt d’un rapport d’essai depuis une réservation | éviter la double saisie | après L5 | — |
