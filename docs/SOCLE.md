# Crucible — socle repris

> Décision T-4 (confirmée le 22 oct. 2026) : le **socle** est copié **une fois** depuis Arche, qui l’a lui-même repris de
> Keystone et déjà adapté à PostgreSQL seul ; aucun module métier n’est copié. Le socle sera ensuite extrait en paquet partagé
> `@epc2i/socle` (lot R-194 de Keystone) et ces copies seront remplacées.
>
> **Commits d’origine de la livraison 1** : Arche **`18c4686`** (pointe de `main` le 22 oct. 2026, « Merge pull request #6 »),
> dont le socle vient de Keystone **`63f43ad`** (voir `docs/SOCLE.md` d’Arche). Les noms `arche` / `ARCHE_` / ports 3400–3410
> sont devenus `crucible` / `CRUCIBLE_` / 3500–3510.

| Élément | Chemin (identique dans Arche) | Adaptation dans Crucible |
|---|---|---|
| Configuration validée | `src/server/config/` | variables `CRUCIBLE_*` |
| Journaux, santé, démarrage | `src/server/log/`, `src/app/api/health/`, `src/instrumentation.ts`, `src/server/startup.ts`, `src/server/health.ts` | — |
| Horloge métier | `src/domain/clock.ts`, `src/server/clock.ts`, `src/components/app/clock.tsx` | `CRUCIBLE_CLOCK` |
| Connexion Entra ID et session | `src/server/auth/`, `src/proxy.ts`, `src/app/api/auth/*`, `src/app/sign-in` | — |
| Règles de connexion | `src/domain/auth.ts` | — |
| Session et « Voir en tant que » | `src/server/session.ts`, `src/server/viewer.ts` | profil par défaut : direction R&D ; `entityCode` au lieu de la filiale |
| Profils et portées | `src/config/roles.ts`, `src/domain/rights.ts` | **réécrits** : 9 profils, portées global / entité / installation / projet (spec 01) |
| Coquille et registre d’écrans | `src/config/screens.ts`, `src/components/app/shell/` | registre de la spec 05 ; sections Planification, Référentiel, Pilotage, Administration |
| Design Nocturne | `src/styles/nocturne.css`, `src/components/ds/`, `src/components/app/` | — |
| i18n et complétude du français | `src/i18n/` | dictionnaires de Crucible |
| Base de données | `src/server/db/` (client, transactions, migrations, provision, postgres) | schéma `crucible`, verrous `crucible.migrations` / `crucible.ecritures` |
| Piste d’audit append-only | `writeAudit`, `audit_entries`, déclencheur | colonne `project_code` au lieu de `capex_id` |
| Vue `pub_journal` | migration `0002_share_journal` | `projet` = code de projet Crucible |
| Durcissement HTTP | `src/server/http/`, `next.config.ts` | — |
| Tâches planifiées, sauvegardes, Matrix | `src/server/jobs/`, `src/server/backup.ts`, `src/server/integrations/matrix/`, `scripts/` | application `crucible` |
| Administration | `src/domain/admin.ts`, `src/features/admin/`, `src/app/(app)/admin/` | **réécrite** : entités, sites, installations et partenaires, projets |
| Conteneur, Coolify, CI | `Dockerfile`, `deploy/`, `.github/workflows/ci.yml` | port 3500 |
| Page « reste à développer » | `scripts/remaining-work/` | domaines de Crucible |

**Jamais copiés** : le cycle DIG-PRODI, le budget, les CAPEX (`src/domain/{lifecycle,budget,capex}.ts`, `src/features/capex/`,
`src/server/dal/{capex,cycle}.ts`), leurs écrans et migrations, le jeu de démonstration d’Arche.
