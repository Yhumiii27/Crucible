# Livraison 13 — parcours de bout en bout dans le navigateur (CR-080)

> 1er nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « lance le prochain point du reste à
> faire », choix CR-080 (ajout de l’analyse comparative du 25 oct. 2026, approuvé par ce choix). Relecture du questionnaire
> avant la livraison : aucune nouvelle réponse. Nouvelle question **X-15** ([`DECISIONS.md`](DECISIONS.md) §10), réponse
> par défaut appliquée, à confirmer.

## 1. Les parcours

Playwright (`@playwright/test`, déjà dans les dépendances), Chromium, interface en français, contre le serveur de production
avec le jeu de démonstration et la date d’affaires du jeudi 22 octobre 2026 (`tests/e2e/journeys.spec.ts`,
`playwright.config.ts`). Chaque parcours passe par les écrans comme une personne : panneaux latéraux, formulaires, messages.

| Parcours | Ce qui est vérifié |
|---|---|
| Demande refusée par la règle du PDE | un chef de projet demande les salles du laboratoire PDE pendant l’essai confirmé du pilote : refus « Règle d’exclusion · PDE-ONE-ZONE · PDE-PIL » (P-2) |
| Check-list avant le démarrage | le responsable du PDE écrit la check-list sécurité ; le technicien ne peut pas démarrer l’essai de l’après-midi, la remplit dans le panneau, puis le démarre (CR-075) |
| Assistant | la direction R&D pose une question dans le panneau de l’assistant et obtient une réponse, sans erreur (livraison 6) |
| Menu du coordinateur | chaque écran du menu (accueil, planning, décisions, propositions, conflits, charge, personnes, règles, aléas, notifications, onglets de l’installation) s’ouvre en 200 avec son titre |

## 2. Où ils tournent

- **CI** : dans l’étape du serveur de production, après le contrôle de fumée (les parcours modifient la base) :
  `npx playwright install --with-deps chromium` puis `npm run test:e2e` ; en cas d’échec, le rapport, les captures et les
  traces sont joints au run (`playwright-report`, 7 jours).
- **Poste local** : base neuve (`npm run db:local`, migration avec `CRUCIBLE_SEED=demo`), build, serveur sur le port 3510
  avec `CRUCIBLE_CLOCK=2026-10-22`, puis `npm run test:e2e` (`CRUCIBLE_E2E_URL` pour un autre serveur, `PW_CHROMIUM_PATH`
  pour un autre Chromium).

## 3. Vérifications

- Les 4 parcours passent localement sur une base neuve (10 s) ; le contrôle de fumée passe encore après eux.
- `npm run typecheck`, `npm run lint` : sans erreur. Aucune migration.
