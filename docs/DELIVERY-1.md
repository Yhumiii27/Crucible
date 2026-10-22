# Livraison 1 — socle

> 22 oct. 2026, branche `claude/lucid-dirac-7bdq6x`. Plan : [`PLAN.md`](PLAN.md) (L1). Lancée après les réponses du
> responsable produit au questionnaire « Décisions Crucible » : 56 réponses par défaut confirmées, et P-2 précisée (le PDE est
> un bâtiment unique en zones — atelier mécanique, pilote, pièces laboratoire — où l’on ne travaille qu’à un endroit à la fois).

## 1. Ce qui est livré

| Domaine | Contenu | Où |
|---|---|---|
| Socle repris d’Arche (`18c4686`, lui-même de Keystone `63f43ad`) | configuration validée, journaux, santé, horloge métier, connexion Entra ID et mode démo « Voir en tant que », durcissement HTTP, i18n FR/EN avec contrôle de complétude, design Nocturne, piste d’audit append-only, worker, sauvegardes, déclaration à Matrix, conteneur, Coolify, CI | [`SOCLE.md`](SOCLE.md) |
| Base de données | **PostgreSQL uniquement** (T-1), schéma `crucible`, rôle `crucible_app` ; migrations `0000_platform`, `0001_audit_append_only`, `0002_share_journal` (vue `pub_journal`, contrat D18) | `src/server/db/`, `drizzle/` |
| Profils et visibilité | 9 profils (spec 01) ; portées global / entité / installation / projet ; **filtres SQL** sur chaque lecture : un partenaire (EPC France) ne voit que les installations partagées avec son entité (laboratoire 67) et ses projets ; un projet confidentiel n’est vu que de son équipe et de la direction R&D (U-3) ; l’administrateur ne voit aucune donnée métier | `src/config/roles.ts`, `src/domain/rights.ts`, `src/server/dal/visibility.ts` |
| Administration | comptes, rôles et portées (un interlocuteur partenaire reçoit une entité partenaire), entités, sites, installations et leurs partenaires ; projets et classe de priorité P1 / P2 / P3 par la direction R&D (A-1, A-5) ; chaque écriture vérifiée côté serveur et auditée | `src/domain/admin.ts`, `src/features/admin/`, `/admin/users`, `/admin/organisation` |
| Écrans | coquille et registre des 15 écrans de la spec 05 ; accueil, installations, projets, administration ; les autres affichent « prévu pour la livraison n » ; un écran hors de l’espace du profil répond 404 | `src/app/`, `src/config/screens.ts` |
| Jeu de démonstration (T-7) | entités EPC2i et EPC France ; laboratoire 67 (partagé avec EPC France) et PDE ; 4 projets fictifs (dont un confidentiel et un d’EPC France) ; une personne par profil | `src/server/db/seed/demo.ts` |
| Page « reste à développer » | inventaire de Crucible | `docs/reste-a-developper.json`, `npm run remaining:page` |

## 2. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur.
- `npm test` : **132 tests** sur PostgreSQL 16 (une base neuve par fichier), dont la visibilité en SQL pour chacun des 9
  profils, l’administration (droits, écritures, audit, auto-verrouillage), le parcours Entra complet, la piste d’audit
  (UPDATE / DELETE / TRUNCATE refusés), `pub_journal`, la sauvegarde et la restauration, la complétude du français.
- `npm run db:local` puis `npm run db:migrate` (jeu `demo`), `npm run build`, `next start` sur le port 3510 et
  `npm run test:smoke` : **19 contrôles HTTP** passent (santé, CSP, installations et projets par profil, 404 hors périmètre,
  administration).
- Non vérifié ici : la construction de l’image Docker (pas de démon Docker dans la session ; job « image » de la CI).

## 3. Écarts et limites

- Les zones du PDE (atelier mécanique, pilote, pièces laboratoire), les calendriers et la règle « une zone à la fois »
  arrivent avec la livraison 2 (moyens d’essais et réservations).
- Les sites et les entités sont tenus par Crucible en attendant Matrix (M-6) ; le site de démonstration est fictif.
- Pas de branche `main` sur le dépôt : la PR attend sa création (voir le compte rendu de la session).
