# Crucible — reste à développer

Inventaire initial du 2026-10-22, mis à jour le 2026-10-22 (branche `claude/lucid-dirac-7bdq6x`). Il recense ce qu'il reste à développer, à brancher, à décider ou à mettre en production pour Crucible, aligné sur le plan de livraisons (`docs/PLAN.md`). Il est tenu à jour à chaque développement : un point passe « en cours » quand une livraison le prend, « fait » quand il est intégré et vérifié. Le détail est dans `docs/reste-a-developper.json` ; ce document et la page sont produits par `npm run remaining:page`.

**Lecture.** Priorité : Bloquant production, Prochaine étape, À décider (il faut d'abord trancher), Plus tard. Effort, pour un développeur qui connaît le code : S < 2 jours, M ≤ 1 semaine, L ≤ 3 semaines, XL > 3 semaines. Les identifiants entre parenthèses renvoient aux décisions (`docs/DECISIONS.md`) et aux demandes (`docs/DEMANDES-*.md`).

## 1. En bref

**Avancement** : 9 faits, 3 en cours, 4 à faire, sur 16 points.

| Priorité | Points restants | Effort estimé (jours) |
|---|---:|---:|
| Bloquant production | 1 | ≈ 4 |
| Prochaine étape | 1 | ≈ 4 |
| À décider | 1 | ≈ 2 |
| Plus tard | 4 | ≈ 32 |
| **Total** | **7** | **≈ 42** |

L'effort est un ordre de grandeur (S = 1,5 j, M = 4 j, L = 12 j, XL = 30 j) : il ne compte ni l'attente des décisions et des données, ni les développements à faire côté Keystone, Codex, Vigie, Cursus ou Matrix, ni la recette.

| Statut (points restants) | Points |
|---|---:|
| Non commencé | 3 |
| Partiel | 0 |
| Attend le responsable produit | 2 |
| Attend un système externe | 2 |

| Domaine | Bloquant production | Prochaine étape | À décider | Plus tard | Restants | Faits |
|---|---:|---:|---:|---:|---:|---:|
| Plateforme et mise en production | 1 | 0 | 0 | 0 | 1 | 1 |
| Connexion, profils et visibilité | 0 | 0 | 0 | 0 | 0 | 2 |
| Moyens d’essais, règles et réservations | 0 | 0 | 0 | 0 | 0 | 3 |
| Besoins des projets et anticipation | 0 | 0 | 0 | 0 | 0 | 1 |
| Proposition de créneaux et arbitrages | 0 | 0 | 0 | 1 | 1 | 0 |
| Aléas, scénarios et pilotage | 0 | 0 | 0 | 1 | 1 | 1 |
| Assistant IA | 0 | 0 | 0 | 1 | 1 | 0 |
| Liens avec les autres outils | 0 | 0 | 0 | 1 | 1 | 0 |
| Cadrage, décisions et données attendues | 0 | 1 | 1 | 0 | 2 | 1 |

### 1.1 Chemin critique vers la production

Les points « Bloquant production » restants, par domaine. Sans eux, Crucible reste une démonstration.

- **Plateforme et mise en production** : CR-007 Mise en production : hébergement, Entra réel, serveur commun *(en cours, Livraison 1)*.

### 1.2 Ce qui attend le responsable produit

Décisions à prendre et données à fournir avant de pouvoir développer (`docs/DECISIONS.md`).

- **CR-002** Réponses du responsable produit — —
- **CR-003** Données à fournir D-1 à D-11 — Responsable produit et équipes R&D
- **CR-050** Assistant IA — DSI (fournisseur, I-3)

### 1.3 Ce qui attend les autres applications

- **CR-007** Mise en production : hébergement, Entra réel, serveur commun — Matrix, DSI
- **CR-060** Connecteurs Keystone, Cursus, Vigie, Codex — Keystone, Cursus, Vigie, Codex

## 2. Liste détaillée par domaine

### 2.1 Plateforme et mise en production (1 restants, 1 faits)

**CR-007 · Mise en production : hébergement, Entra réel, serveur commun** — *Bloquant production · attend un système externe · effort M* · **en cours (Livraison 1)**  
Hébergeur (T-6), inscription Entra, rôle et schéma créés par Matrix (M-1 à M-5).  
*Avancement : Kit Coolify du serveur commun (deploy/compose.shared.yaml, EXPLOITATION.md § 4.1) essayé en local contre le socle de Matrix (rôle crucible_app posé à la main) : migrations, jeu de démonstration, santé, sauvegarde, authentification HTTP. Reste : rôle et partage côté Matrix (M-1 à M-5), mise en service dans Coolify, Entra réel. · Attend : Matrix, DSI · Sources : docs/DEMANDES-MATRIX.md, docs/EXPLOITATION.md*

**~~CR-004 · Socle repris (connexion, droits, audit, i18n, PostgreSQL, worker, sauvegardes, CI)~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 1)**  
Socle d’Arche (lui-même repris de Keystone), PostgreSQL seul, schéma crucible.  
*Avancement : 132 tests, build et 19 contrôles de fumée HTTP. · Sources : docs/SOCLE.md*

### 2.2 Connexion, profils et visibilité (0 restants, 2 faits)

**~~CR-005 · Profils, portées et visibilité (U-3)~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 1)**  
9 profils, portées global / entité / installation / projet, filtres SQL ; un partenaire ne voit que les installations partagées et ses projets ; projets confidentiels réservés à leur équipe.  
*Avancement : src/domain/rights.ts, src/server/dal/visibility.ts. · Sources : docs/spec/01-profils-droits.md*

**~~CR-006 · Administration : comptes, rôles, entités, sites, installations, projets~~** — *Prochaine étape · non commencé · effort S* · **fait (Livraison 1)**  
Écritures validées côté serveur et auditées ; projets et classe de priorité par la direction R&D.  
*Avancement : src/features/admin/. · Sources : docs/spec/05-ecrans.md*

### 2.3 Moyens d’essais, règles et réservations (0 restants, 3 faits)

**~~CR-010 · Moyens d’essais, zones du PDE, calendriers, indisponibilités, contrôles~~** — *Prochaine étape · non commencé · effort L* · **fait (Livraison 2)**  
Installations, moyens réservables (zones du PDE : atelier mécanique, pilote, pièces laboratoire), horaires, maintenances, contrôles échus bloquants (R-6).  
*Avancement : Moyens, zones du PDE, horaires, fermetures, indisponibilités, contrôles (R-6) ; fiche /facilities/[code]. · Sources : docs/spec/02-objets.md §1–2*

**~~CR-011 · Règles d’exclusion validées par la sécurité~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 2)**  
Une zone du PDE active à la fois (P-2, R-2) ; validation par le référent sécurité (R-3), versions, référence Codex.  
*Avancement : Règles proposées, validées ou retirées par le référent sécurité ; PDE-ONE-ZONE appliquée à chaque réservation. · Sources : docs/spec/03-planification.md §3*

**~~CR-012 · Réservations manuelles et contrôle des contraintes dures~~** — *Prochaine étape · non commencé · effort L* · **fait (Livraison 2)**  
Réservation refusée avec la règle citée ; planning des moyens ; « Mon planning » (démarrer, terminer) ; réservations non tenues (A-7).  
*Avancement : Demande, confirmation, annulation, démarrer / terminer, non-tenue (A-7) ; planning des moyens ; Mon planning. · Sources : docs/spec/03-planification.md, docs/spec/05-ecrans.md*

### 2.4 Besoins des projets et anticipation (0 restants, 1 faits)

**~~CR-020 · Besoins des projets, jalons et plan de charge~~** — *Plus tard · non commencé · effort M* · **fait (Livraison 3)**  
Prévisions, demandes, délai de prévenance (F-5), plan de charge 26 semaines (F-6), goulots et creux.  
*Avancement : Jalons, catalogue des types d’essai, besoins (prévision / demande, rétro-planification sur le jalon), prévenance de 10 jours ouvrés (F-5), plan de charge sur 26 semaines puis par trimestre (goulots, creux, règle du PDE), références Codex ; goulot du PDE signalé 8 semaines avant sur la démo. Choix à confirmer : F-11, F-12, F-13, S-7. · Sources : docs/spec/03-planification.md §6*

### 2.5 Proposition de créneaux et arbitrages (1 restants)

**CR-030 · Moteur de proposition, conflits et arbitrages** — *Plus tard · non commencé · effort L*  
Personnes et compétences, substitutions validées, heuristique déterministe (T-3), fiches de conflit, règles de priorité versionnées (A-1, A-2).  
*Sources : docs/spec/03-planification.md §4–5*

### 2.6 Aléas, scénarios et pilotage (1 restants, 1 faits)

**CR-040 · Aléas, replanification, scénarios et notifications** — *Plus tard · non commencé · effort M*  
Scénario de reprise, avant / après par projet, urgences (A-8), cloche et e-mail (F-8).  
*Sources : docs/spec/03-planification.md §7*

**~~CR-013 · Pilotage de l’occupation et import de l’historique~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 2)**  
Occupation réservée / réalisée / avec préparation / blocage (P-5), attente par entité, mesure de référence (X-2, F-9).  
*Avancement : Pilotage /dashboard (réservé, réalisé, avec préparation, blocage, attente par entité, quotas) ; import de l’historique (F-9). · Sources : docs/spec/02-objets.md §6*

### 2.7 Assistant IA (1 restants)

**CR-050 · Assistant IA** — *Plus tard · attend le responsable produit · effort M*  
Assistant adossé au moteur, sans écriture seule (I-1 à I-4) ; fournisseur à valider.  
*Attend : DSI (fournisseur, I-3) · Sources : docs/spec/04-assistant-ia.md*

### 2.8 Liens avec les autres outils (1 restants)

**CR-060 · Connecteurs Keystone, Cursus, Vigie, Codex** — *Plus tard · attend un système externe · effort L* · **en cours (Livraison 3)**  
Jalons Keystone (K-2), habilitations et absences Cursus (CU-1, CU-2), contrôles et coactivité Vigie (V-1, V-2), documents Codex (CX-1, CX-2) ; vues pub_ publiées.  
*Avancement : Vues publiées pub_moyens et pub_reservations (droits posés par Matrix ; copie dans partage/80-crucible.sql : demande M-7 à valider) ; écran des connecteurs. Demandes transmises le 22/10 : Keystone K-2 (pub_jalons), Cursus CU-1 (pub_absences), Vigie V-1 (pub_controles). Lectures à brancher quand les vues seront publiées. · Attend : Keystone, Cursus, Vigie, Codex · Sources : docs/DEMANDES-\*.md*

### 2.9 Cadrage, décisions et données attendues (2 restants, 1 faits)

**CR-003 · Données à fournir D-1 à D-11** — *Prochaine étape · attend le responsable produit · effort M*  
Moyens, règles d’exclusion, types d’essai, substitutions, projets et besoins, personnes, accord EPC France, historique, origine des 30 %, contrôles, participants à l’atelier.  
*Avancement : Indispensables pour remplacer le jeu de démonstration : moyens réels (D-1), règles (D-2), accord EPC France (D-7), historique (D-8), origine des 30 % (D-9), contrôles (D-10). · Attend : Responsable produit et équipes R&D · Sources : docs/DECISIONS.md §11, docs/ATELIER-CADRAGE.md*

**CR-002 · Réponses du responsable produit** — *À décider · non commencé · effort S* · **en cours**  
57 questions du questionnaire « Décisions Crucible ».  
*Avancement : 22 oct. 2026 : 56 réponses par défaut, P-2 précisée. Nouvelles questions à confirmer : F-10, R-10, P-7 (livraison 2), F-11, F-12, F-13, S-7 (livraison 3), défaut appliqué. · Sources : docs/DECISIONS.md*

**~~CR-001 · Cadrage (livraison 0)~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 0)**  
Analyse du besoin, état des lieux des outils du groupe, spécification docs/spec/00–05, décisions, plan, guide d’atelier, demandes aux autres dépôts, questionnaire.  
*Avancement : Branche claude/lucid-dirac-7bdq6x, 22 oct. 2026. · Sources : docs/ANALYSE.md, docs/spec/, docs/DECISIONS.md*

## 3. Mises à jour

- 2026-10-22 — Sécurité : Next.js 16.4.0 → 16.4.2 (avis critiques GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr et GHSA-p3m5-59mp-jv5r) ; npm audit de production sans vulnérabilité. Demande M-7 transmise à Matrix (Yhumiii27/Matrix#17).
- 2026-10-22 — Livraison 3 : jalons, types d’essai, besoins (prévisions et demandes), prévenance F-5 pour toutes les entités, plan de charge sur 26 semaines et enveloppes à 12 mois (goulot du PDE signalé 8 semaines avant), références Codex des protocoles et rapports, vues pub_moyens et pub_reservations, écran des connecteurs.
- 2026-10-22 — Kit Coolify du serveur commun : deploy/compose.shared.yaml (migrate, app, worker sur le réseau coolify, base epc2i-postgres), authentification HTTP de la bêta par un middleware Traefik dans les étiquettes, runbook EXPLOITATION.md § 4 (ressource, variables, contrôles, partage 80/90/95).
- 2026-10-22 — Livraison 2 : moyens et calendriers, règles d’exclusion validées par la sécurité (PDE : une zone à la fois), accords, réservations sous contraintes dures, planning, Mon planning, pilotage de l’occupation, import de l’historique.
- 2026-10-22 — Livraison 1 (socle) : socle d’Arche sur PostgreSQL seul, 9 profils et visibilité par entité, installation et projet (U-3), administration, jeu de démonstration (laboratoire 67, PDE), CI ; réponses du questionnaire appliquées.
- 2026-10-22 — Livraison 0 (cadrage) : inventaire initial aligné sur docs/PLAN.md.
