# Livraison 20 — projets et salariés lus dans Keystone et Cursus (suite de CR-060)

> 4 nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « on reprend ». Relecture du
> questionnaire et de `REQUESTS.md` : aucune nouvelle réponse, aucune entrée ouverte. Keystone publie désormais la catégorie
> R&D de ses projets (demande K-3 de Crucible, R-196 de Keystone ; colonne `categorie` de `keystone.pub_projets`, préparée
> dans Matrix). Nouvelle question **X-22** ([`DECISIONS.md`](DECISIONS.md) §10), réponse par défaut appliquée, à confirmer.

## 1. Projets (`keystone.pub_projets`)

- Lu toutes les heures (tâche `connectors-read`) et à la demande (écran Connecteurs), une fois la vue accordée.
- Un projet de Crucible lié à un projet Keystone (code Keystone) prend le **nom** de Keystone ; un projet **clos dans Keystone**
  (`imputable` faux) est signalé « Clos dans Keystone » sur l’écran Organisation (`projects.keystone_closed`, migration
  `0028`), sans être mis de côté : ses réservations et besoins restent, une personne décide.
- Les projets **R&D ouverts** de Keystone absents de Crucible sont listés sur l’écran **Organisation** (lus à l’affichage) ;
  « Ajouter à Crucible » ouvre le formulaire du projet, code Keystone, nom et entité remplis : la personne fixe le code, la
  classe de priorité (A-1) et la confidentialité (U-3), qui restent des décisions de Crucible.

## 2. Salariés (`cursus.pub_salaries`)

- Une personne liée par son **matricule** prend le nom de Cursus ; une personne **sortie** (`actif` faux) est mise de côté
  (plus proposée par le moteur ni planifiée). La lecture ne remet jamais une personne en service : un planificateur le fait.
- Les absences et habilitations lues ensuite ne concernent que les personnes en service.

## 3. Ce qui reste

- **Sites** : saisis dans Crucible tant que M-6 (sites du laboratoire 67 et du PDE, EPC France) est ouverte chez Matrix.
- **Suspensions d’essais de Vigie (V-2)** : la vue `vigie.pub_suspensions_essais` est déjà accordée par Matrix, mais la
  demande n’a jamais été déposée dans le `REQUESTS.md` de Vigie (constat de la note de convergence de Vigie). À déposer après
  votre « validé ».

## 4. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **440 tests** sur PostgreSQL 16, dont 2 nouveaux dans
  `src/server/integrations/connectors.test.ts` (projets : nom, projets à ajouter, clos signalé ; salariés : nom, sortie, jamais
  remis), les autres adaptés aux cinq vues lues.
- Contrôle de fumée : 1 contrôle de plus (colonne « Projet Keystone » de l’écran Organisation).
- Migration `0028_keystone_closed` (générée, une colonne ajoutée à `projects` ; aucune colonne retirée ni renommée).
