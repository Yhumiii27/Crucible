# Demandes de Crucible à Cursus

> 22 oct. 2026. Crucible ne modifie jamais le dépôt Cursus : ces demandes sont à transmettre par le responsable produit.
>
> **Transmise** (validée par le responsable produit le 22/10/2026) : CU-1, entrée du `REQUESTS.md` de Cursus
> (Yhumiii27/Cursus#15, fusionnée), statut OUVERTE — vue `pub_absences` sans type ni motif d’absence.

| # | Demande | Pourquoi | Bloque | Décision liée |
|---|---|---|---|---|
| CU-1 | Publier une vue **`pub_absences`** limitée à ce qu’un planificateur doit savoir : `matricule`, `du`, `au`, `demi_journee_debut`, `demi_journee_fin`, `statut` (validée / demandée) — **sans le motif** (donnée personnelle) | ne pas planifier un opérateur absent | L4 | S-3, F-7 |
| CU-2 | Accorder la lecture de `pub_salaries`, `pub_titres`, `pub_titres_detenus` à `crucible_app` (via Matrix) | habilitations requises par type d’essai | L4 | S-3 |
| CU-3 | (facultatif) Publier les équipes (`equipes`, membres) | planifier par équipe d’installation | après L4 | — |
