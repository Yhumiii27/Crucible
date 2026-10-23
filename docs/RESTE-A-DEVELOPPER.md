# Crucible — reste à développer

Inventaire initial du 2026-10-22, mis à jour le 2026-10-23 (branche `claude/lucid-dirac-7bdq6x`). Il recense ce qu'il reste à développer, à brancher, à décider ou à mettre en production pour Crucible, aligné sur le plan de livraisons (`docs/PLAN.md`). Il est tenu à jour à chaque développement : un point passe « en cours » quand une livraison le prend, « fait » quand il est intégré et vérifié. Le détail est dans `docs/reste-a-developper.json` ; ce document et la page sont produits par `npm run remaining:page`.

**Lecture.** Priorité : Bloquant production, Prochaine étape, À décider (il faut d'abord trancher), Plus tard. Effort, pour un développeur qui connaît le code : S < 2 jours, M ≤ 1 semaine, L ≤ 3 semaines, XL > 3 semaines. Les identifiants entre parenthèses renvoient aux décisions (`docs/DECISIONS.md`) et aux demandes (`docs/DEMANDES-*.md`).

## 1. En bref

**Avancement** : 13 faits, 4 en cours, 2 à faire, sur 19 points.

| Priorité | Points restants | Effort estimé (jours) |
|---|---:|---:|
| Bloquant production | 1 | ≈ 4 |
| Prochaine étape | 2 | ≈ 8 |
| À décider | 1 | ≈ 2 |
| Plus tard | 2 | ≈ 14 |
| **Total** | **6** | **≈ 27** |

L'effort est un ordre de grandeur (S = 1,5 j, M = 4 j, L = 12 j, XL = 30 j) : il ne compte ni l'attente des décisions et des données, ni les développements à faire côté Keystone, Codex, Vigie, Cursus ou Matrix, ni la recette.

| Statut (points restants) | Points |
|---|---:|
| Non commencé | 1 |
| Partiel | 0 |
| Attend le responsable produit | 3 |
| Attend un système externe | 2 |

| Domaine | Bloquant production | Prochaine étape | À décider | Plus tard | Restants | Faits |
|---|---:|---:|---:|---:|---:|---:|
| Plateforme et mise en production | 1 | 0 | 0 | 0 | 1 | 1 |
| Connexion, profils et visibilité | 0 | 0 | 0 | 0 | 0 | 2 |
| Moyens d’essais, règles et réservations | 0 | 0 | 0 | 0 | 0 | 3 |
| Besoins des projets et anticipation | 0 | 0 | 0 | 0 | 0 | 1 |
| Proposition de créneaux et arbitrages | 0 | 0 | 0 | 0 | 0 | 1 |
| Aléas, scénarios et pilotage | 0 | 1 | 0 | 0 | 1 | 3 |
| Assistant IA | 0 | 0 | 0 | 1 | 1 | 1 |
| Liens avec les autres outils | 0 | 0 | 0 | 1 | 1 | 0 |
| Cadrage, décisions et données attendues | 0 | 1 | 1 | 0 | 2 | 1 |

### 1.1 Chemin critique vers la production

Les points « Bloquant production » restants, par domaine. Sans eux, Crucible reste une démonstration.

- **Plateforme et mise en production** : CR-007 Mise en production : hébergement, Entra réel, serveur commun *(en cours, Livraison 1)*.

### 1.2 Ce qui attend le responsable produit

Décisions à prendre et données à fournir avant de pouvoir développer (`docs/DECISIONS.md`).

- **CR-002** Réponses du responsable produit — —
- **CR-003** Données à fournir D-1 à D-11 — Responsable produit et équipes R&D
- **CR-051** Activer Claude pour l’assistant — DSI (fournisseur et région, I-3)
- **CR-070** Pilote (4 semaines d’usage réel) — Atelier et données D-1 à D-11 ; DSI (hébergement T-6, inscription Entra) ; Matrix (M-6)

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

### 2.5 Proposition de créneaux et arbitrages (0 restants, 1 faits)

**~~CR-030 · Moteur de proposition, conflits et arbitrages~~** — *Plus tard · non commencé · effort L* · **fait (Livraison 4)**  
Personnes et compétences, substitutions validées, heuristique déterministe (T-3), fiches de conflit, règles de priorité versionnées (A-1, A-2).  
*Avancement : Personnes et compétences (lecture de Cursus quand la vue est accordée), exigences des types d’essai, équipements mobiles, substitutions validées (R-4), règles de priorité versionnées, moteur déterministe qui propose seulement (passage quotidien), acceptation par lot après un nouveau contrôle, fiches de conflit avec options, règle citée et recommandation, arbitrages en ajout seul, veto sécurité. Propriété vérifiée sur 60 scénarios aléatoires. Choix à confirmer : R-11, A-9, F-14. · Sources : docs/spec/03-planification.md §4–5*

### 2.6 Aléas, scénarios et pilotage (1 restants, 3 faits)

**CR-070 · Pilote (4 semaines d’usage réel)** — *Prochaine étape · attend le responsable produit · effort M* · **en cours (Pilote)**  
Laboratoire 67 et PDE (P-3) : Crucible référence des réservations, mesure de référence comparée au pilote (X-2), revue hebdomadaire, bilan (P-10).  
*Avancement : Écran Pilote prêt : premier jour, liste de contrôle du démarrage, mesure de référence comparée au pilote. Démarrage à la levée des prérequis de docs/PILOTE.md §2. · Attend : Atelier et données D-1 à D-11 ; DSI (hébergement T-6, inscription Entra) ; Matrix (M-6) · Sources : docs/PILOTE.md, docs/PLAN.md*

**~~CR-013 · Pilotage de l’occupation et import de l’historique~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 2)**  
Occupation réservée / réalisée / avec préparation / blocage (P-5), attente par entité, mesure de référence (X-2, F-9).  
*Avancement : Pilotage /dashboard (réservé, réalisé, avec préparation, blocage, attente par entité, quotas) ; import de l’historique (F-9). · Sources : docs/spec/02-objets.md §6*

**~~CR-041 · Interface fidèle à Keystone~~** — *Prochaine étape · non commencé · effort S* · **fait (Livraison 5b)**  
Menu par thèmes, section Installation, en-tête de Keystone, panneaux latéraux, écrans refaits d’après les maquettes validées (X-5, X-6).  
*Avancement : Menu par thèmes, ⌘K, sélecteur d’installation et onglets ; recherche globale, cloche, date d’état, FR / EN, export CSV ; formulaires en panneaux ; accueil, À trancher, planning, plan de charge, propositions, conflits, aléas, fiche d’installation. · Sources : docs/DELIVERY-5b.md, https://claude.ai/artifact/NCPJzxcCPuXWFxPL36CvJS*

**~~CR-040 · Aléas, replanification, scénarios et notifications~~** — *Plus tard · non commencé · effort M* · **fait (Livraison 5)**  
Scénario de reprise, avant / après par projet, urgences (A-8), cloche et e-mail (F-8).  
*Avancement : Aléas (panne, absence) et scénario de reprise avant / après par projet décidé par le coordinateur ou la direction R&D ; simulations « et si ? » ; urgences (A-8) ; cloche et e-mail, relances d’arbitrage, récapitulatif hebdomadaire ; instantanés hebdomadaires, valeur inoccupée, retards imputables ; vue pub_occupation_hebdo. · Sources : docs/spec/03-planification.md §7*

### 2.7 Assistant IA (1 restants, 1 faits)

**CR-051 · Activer Claude pour l’assistant** — *Plus tard · attend le responsable produit · effort S*  
Poser CRUCIBLE_AI=claude et ANTHROPIC_API_KEY une fois le fournisseur et la région d’hébergement validés par la DSI (I-3) ; confirmer le modèle (I-6) et la conservation des échanges (I-5).  
*Attend : DSI (fournisseur et région, I-3) · Sources : docs/DELIVERY-6.md, docs/DECISIONS.md*

**~~CR-050 · Assistant IA~~** — *Plus tard · non commencé · effort M* · **fait (Livraison 6)**  
Assistant adossé au moteur, sans écriture seule (I-1 à I-4) ; fournisseur à valider.  
*Avancement : Panneau sur chaque écran : trace du moteur, conflits et compte rendu d’arbitrage, alternatives validées, risques de charge, simulation, brouillon de besoin ; gabarits sans IA ; échanges conservés en ajout seul et cités au journal. Claude prêt mais désactivé (CR-051). · Sources : docs/spec/04-assistant-ia.md, docs/DELIVERY-6.md*

### 2.8 Liens avec les autres outils (1 restants)

**CR-060 · Connecteurs Keystone, Cursus, Vigie, Codex** — *Plus tard · attend un système externe · effort L* · **en cours (Livraison 3)**  
Jalons Keystone (K-2), habilitations et absences Cursus (CU-1, CU-2), contrôles et coactivité Vigie (V-1, V-2), documents Codex (CX-1, CX-2) ; vues pub_ publiées.  
*Avancement : Vues publiées pub_moyens et pub_reservations (droits posés par Matrix ; copie dans partage/80-crucible.sql : demande M-7 à valider) ; écran des connecteurs. Demandes transmises le 22/10 : Keystone K-2 (pub_jalons), Cursus CU-1 (pub_absences), Vigie V-1 (pub_controles). Lectures à brancher quand les vues seront publiées. Livraison 4 : lecture des titres de cursus.pub_titres_detenus (compétences rattachées à un titre, personnes avec matricule) dès que la vue est accordée. · Attend : Keystone, Cursus, Vigie, Codex · Sources : docs/DEMANDES-\*.md*

### 2.9 Cadrage, décisions et données attendues (2 restants, 1 faits)

**CR-003 · Données à fournir D-1 à D-11** — *Prochaine étape · attend le responsable produit · effort M*  
Moyens, règles d’exclusion, types d’essai, substitutions, projets et besoins, personnes, accord EPC France, historique, origine des 30 %, contrôles, participants à l’atelier.  
*Avancement : Gabarits prêts pour l’atelier : docs/atelier/gabarits-donnees-crucible.xlsx (un onglet par donnée, format de l’import de l’historique pour D-8). · Attend : Responsable produit et équipes R&D · Sources : docs/ATELIER-CADRAGE.md, docs/DECISIONS.md §11, docs/atelier/gabarits-donnees-crucible.xlsx*

**CR-002 · Réponses du responsable produit** — *À décider · non commencé · effort S* · **en cours**  
57 questions du questionnaire « Décisions Crucible ».  
*Avancement : 22 oct. 2026 : 56 réponses par défaut, P-2 précisée. Nouvelles questions à confirmer : F-10, R-10, P-7 (livraison 2), F-11, F-12, F-13, S-7 (livraison 3), R-11, A-9, F-14 (livraison 4), défaut appliqué. · Sources : docs/DECISIONS.md*

**~~CR-001 · Cadrage (livraison 0)~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 0)**  
Analyse du besoin, état des lieux des outils du groupe, spécification docs/spec/00–05, décisions, plan, guide d’atelier, demandes aux autres dépôts, questionnaire.  
*Avancement : Branche claude/lucid-dirac-7bdq6x, 22 oct. 2026. · Sources : docs/ANALYSE.md, docs/spec/, docs/DECISIONS.md*

## 3. Mises à jour

- 2026-10-23 — Gabarits de données de l’atelier (D-1 à D-11) : classeur docs/atelier/gabarits-donnees-crucible.xlsx, colonnes alignées sur les champs de Crucible, D-8 au format de l’import de l’historique.
- 2026-10-23 — Pilote préparé : écran Pilote (premier jour, liste de contrôle du démarrage, mesure de référence comparée au pilote, X-2), plan docs/PILOTE.md ; démarrage à la levée des prérequis (atelier, données, hébergement, Entra).
- 2026-10-23 — Livraison 6 : assistant IA adossé au moteur — panneau sur chaque écran, explications (trace du moteur, conflits), alternatives, risques, simulation, brouillon de besoin ; repli par gabarits sans IA ; Claude prêt, activé après validation de la DSI.
- 2026-10-23 — Livraison 5b : interface fidèle à Keystone d’après les maquettes validées — menu par thèmes, section Installation, en-tête (recherche, cloche, date d’état, langue, export CSV), panneaux latéraux, écran « À trancher », écrans principaux refaits.
- 2026-10-22 — Livraison 5 : aléas et scénarios de reprise (avant / après par projet), simulations « et si ? », urgences, notifications (cloche, e-mail, relances, récapitulatif), instantanés hebdomadaires, valeur de la capacité inoccupée, retards imputables, vue pub_occupation_hebdo.
- 2026-10-22 — Livraison 4 : personnes et compétences, substitutions validées, règles de priorité versionnées, moteur de proposition déterministe, acceptation des propositions, fiches de conflit, arbitrages et veto sécurité, équipements mobiles.
- 2026-10-22 — Sécurité : Next.js 16.4.0 → 16.4.2 (avis critiques GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr et GHSA-p3m5-59mp-jv5r) ; npm audit de production sans vulnérabilité. Demande M-7 transmise à Matrix (Yhumiii27/Matrix#17).
- 2026-10-22 — Livraison 3 : jalons, types d’essai, besoins (prévisions et demandes), prévenance F-5 pour toutes les entités, plan de charge sur 26 semaines et enveloppes à 12 mois (goulot du PDE signalé 8 semaines avant), références Codex des protocoles et rapports, vues pub_moyens et pub_reservations, écran des connecteurs.
- 2026-10-22 — Kit Coolify du serveur commun : deploy/compose.shared.yaml (migrate, app, worker sur le réseau coolify, base epc2i-postgres), authentification HTTP de la bêta par un middleware Traefik dans les étiquettes, runbook EXPLOITATION.md § 4 (ressource, variables, contrôles, partage 80/90/95).
- 2026-10-22 — Livraison 2 : moyens et calendriers, règles d’exclusion validées par la sécurité (PDE : une zone à la fois), accords, réservations sous contraintes dures, planning, Mon planning, pilotage de l’occupation, import de l’historique.
- 2026-10-22 — Livraison 1 (socle) : socle d’Arche sur PostgreSQL seul, 9 profils et visibilité par entité, installation et projet (U-3), administration, jeu de démonstration (laboratoire 67, PDE), CI ; réponses du questionnaire appliquées.
- 2026-10-22 — Livraison 0 (cadrage) : inventaire initial aligné sur docs/PLAN.md.
