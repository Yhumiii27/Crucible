# Livraison 21 — sites et filiales lus dans Matrix (suite de CR-060)

> 5 nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « continue ». Relecture du
> questionnaire et de `REQUESTS.md` : aucune nouvelle réponse, aucune entrée ouverte. Matrix a fait **M-6** le 04/11/2026
> d’après votre réponse (« Labo 67 = SMC, PDE = SMC, EPC France = SMC ») : site `smc` « Saint-Martin-de-Crau — EPC France
> (laboratoire 67, PDE) » et filiale `SMC` « EPC France », publiés par `matrix.pub_sites` et `matrix.pub_filiales`. La
> localisation est reportée dans P-1 ([`DECISIONS.md`](DECISIONS.md)). Nouvelle question **X-23**, défaut appliqué, à
> confirmer.

## 1. Lien avec le référentiel de Matrix

- Un site et une entité de Crucible portent désormais leur **code Matrix** (`matrix_code`, migration `0029`) : les codes de
  Crucible restent les leurs (majuscules ; aucun renommage, ils sont repris partout), Matrix fait foi pour le nom.
- Écran **Organisation** (administrateur) : une colonne « Matrix » relie chaque site et chaque entité à un site ou une filiale
  de Matrix (ou défait le lien) ; une section liste les **sites et filiales de Matrix absents de Crucible**, avec « Ajouter à
  Crucible » (formulaire rempli, relié à Matrix). Un code de Matrix ne se relie qu’une fois. Journalisé.
- Données de démonstration : le site de démonstration est relié à `smc`, EPC France à `SMC`.

## 2. Lecture

Toutes les heures (`connectors-read`) et à la demande (écran Connecteurs), une fois les vues accordées (`90-droits.sql` de
Matrix les accorde déjà à `crucible_app`) : le nom d’une entité reliée suit `pub_filiales`, le nom, la ville et le pays d’un
site relié suivent `pub_sites`. Un lien posé applique le nom aussitôt.

## 3. Ce qui reste de CR-060

Les **suspensions d’essais de Vigie (V-2)** : vue accordée par Matrix, jamais demandée à Vigie. Note à valider.

## 4. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **441 tests** sur PostgreSQL 16 (lecture des sites et
  filiales, liaison réservée à l’administrateur, code inconnu ou déjà relié refusé, site ajouté depuis Matrix relié, journal).
- Contrôle de fumée et parcours Playwright sur base neuve.
- Migration `0029_matrix_codes` (générée : deux colonnes ajoutées, uniques).
