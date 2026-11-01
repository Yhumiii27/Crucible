# Crucible — reste à développer

Inventaire initial du 2026-10-22, mis à jour le 2026-11-01 (branche `claude/lucid-dirac-7bdq6x`). Il recense ce qu'il reste à développer, à brancher, à décider ou à mettre en production pour Crucible, aligné sur le plan de livraisons (`docs/PLAN.md`). Il est tenu à jour à chaque développement : un point passe « en cours » quand une livraison le prend, « fait » quand il est intégré et vérifié. Le détail est dans `docs/reste-a-developper.json` ; ce document et la page sont produits par `npm run remaining:page`.

**Lecture.** Priorité : Bloquant production, Prochaine étape, À décider (il faut d'abord trancher), Plus tard. Effort, pour un développeur qui connaît le code : S < 2 jours, M ≤ 1 semaine, L ≤ 3 semaines, XL > 3 semaines. Les identifiants entre parenthèses renvoient aux décisions (`docs/DECISIONS.md`) et aux demandes (`docs/DEMANDES-*.md`).

## 1. En bref

**Avancement** : 20 faits, 4 en cours, 8 à faire, sur 32 points.

| Priorité | Points restants | Effort estimé (jours) |
|---|---:|---:|
| Bloquant production | 1 | ≈ 4 |
| Prochaine étape | 2 | ≈ 8 |
| À décider | 5 | ≈ 26 |
| Plus tard | 4 | ≈ 30 |
| **Total** | **12** | **≈ 67** |

L'effort est un ordre de grandeur (S = 1,5 j, M = 4 j, L = 12 j, XL = 30 j) : il ne compte ni l'attente des décisions et des données, ni les développements à faire côté Keystone, Codex, Vigie, Cursus ou Matrix, ni la recette.

| Statut (points restants) | Points |
|---|---:|
| Non commencé | 7 |
| Partiel | 0 |
| Attend le responsable produit | 3 |
| Attend un système externe | 2 |

| Domaine | Bloquant production | Prochaine étape | À décider | Plus tard | Restants | Faits |
|---|---:|---:|---:|---:|---:|---:|
| Plateforme et mise en production | 1 | 0 | 0 | 1 | 2 | 3 |
| Connexion, profils et visibilité | 0 | 0 | 0 | 0 | 0 | 2 |
| Moyens d’essais, règles et réservations | 0 | 0 | 1 | 0 | 1 | 7 |
| Besoins des projets et anticipation | 0 | 0 | 0 | 0 | 0 | 1 |
| Proposition de créneaux et arbitrages | 0 | 0 | 0 | 0 | 0 | 1 |
| Aléas, scénarios et pilotage | 0 | 1 | 2 | 0 | 3 | 4 |
| Assistant IA | 0 | 0 | 0 | 1 | 1 | 1 |
| Liens avec les autres outils | 0 | 0 | 1 | 2 | 3 | 0 |
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
- **CR-074** Refacturation interne : tarifs par moyen et par entité, coût des heures réservées et réelles, relevés par projet — Responsable produit (hors demande initiale)
- **CR-076** Consommables et stock liés aux essais (quantités, péremption, alertes) — Responsable produit (hors demande initiale)
- **CR-077** Rapports PDF et tableaux de bord exportables vers la BI — Responsable produit (hors demande initiale)
- **CR-081** Résultats d’essais et cahier de laboratoire (ELN) rattachés à la réservation — Responsable produit (hors périmètre déclaré)

### 1.3 Ce qui attend les autres applications

- **CR-007** Mise en production : hébergement, Entra réel, serveur commun — Matrix, DSI
- **CR-060** Connecteurs Keystone, Cursus, Vigie, Codex — Keystone, Cursus, Vigie, Codex

## 2. Liste détaillée par domaine

### 2.1 Plateforme et mise en production (2 restants, 3 faits)

**CR-007 · Mise en production : hébergement, Entra réel, serveur commun** — *Bloquant production · attend un système externe · effort M* · **en cours (Livraison 1)**  
Hébergeur (T-6), inscription Entra, rôle et schéma créés par Matrix (M-1 à M-5). Analyse comparative du 25 oct. 2026 : prérequis bloquants confirmés (hébergement T-6, Entra réel, données D-1 à D-11, pilote). Écart P2 (niveau standard) : la bêta tourne en mode démo (CRUCIBLE_AUTH=demo, « voir en tant que ») derrière l’authentification HTTP de Coolify ; l’authentification réelle par Entra doit être en place avant tout usage hors démonstration. La limitation des tentatives côté application fait l’objet de CR-079.  
*Avancement : Kit Coolify du serveur commun (deploy/compose.shared.yaml, EXPLOITATION.md § 4.1) essayé en local contre le socle de Matrix (rôle crucible_app posé à la main) : migrations, jeu de démonstration, santé, sauvegarde, authentification HTTP. Reste : rôle et partage côté Matrix (M-1 à M-5), mise en service dans Coolify, Entra réel. · Attend : Matrix, DSI · Sources : docs/DEMANDES-MATRIX.md, docs/EXPLOITATION.md*

**CR-082 · Mobile : réservation et pointage depuis le téléphone, hors ligne à l’atelier** — *Plus tard · non commencé · effort M*  
P3, standard. Recette de l’interface sur téléphone (Mon planning, démarrer / terminer, cloche), écrans allégés pour l’atelier et le PDE, fonctionnement hors ligne avec resynchronisation. Aujourd’hui l’application web est responsive mais n’a pas été recettée sur mobile et ne fonctionne pas hors ligne.  
*Avancement : Consigné le 26 oct. 2026 (analyse comparative) ; à valider avant de construire (question X-n à ajouter à DECISIONS.md si retenu). · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**~~CR-004 · Socle repris (connexion, droits, audit, i18n, PostgreSQL, worker, sauvegardes, CI)~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 1)**  
Socle d’Arche (lui-même repris de Keystone), PostgreSQL seul, schéma crucible.  
*Avancement : 132 tests, build et 19 contrôles de fumée HTTP. · Sources : docs/SOCLE.md*

**~~CR-079 · Limitation des tentatives (rate limiting applicatif)~~** — *À décider · non commencé · effort S* · **fait (Livraison 11)**  
P2, standard. Limiter côté application les tentatives sur la connexion, la recherche globale, les exports et l’assistant (par session et par adresse), journaliser les dépassements. Aujourd’hui aucune limitation applicative ; la bêta repose sur l’authentification HTTP de Coolify (Traefik). L’authentification réelle est suivie dans CR-007.  
*Avancement : Fait le 1er nov. 2026 (DELIVERY-11.md, X-13) : connexion, recherche, exports, assistant, appareils et abonnements limités par personne ou par adresse ; compteurs en base ; premier dépassement journalisé. · Attend : Responsable produit (hors demande initiale) · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**~~CR-080 · Tests de bout en bout dans le navigateur~~** — *À décider · non commencé · effort M* · **fait (Livraison 13)**  
P2, qualité. Parcours Playwright sur les écrans principaux (réservation refusée avec la règle citée, acceptation d’une proposition, scénario de reprise, panneau de l’assistant), joués en CI sur le port 3510. Aujourd’hui Playwright est installé mais aucun test de bout en bout n’existe ; seuls les tests unitaires et les contrôles de fumée HTTP tournent.  
*Avancement : Fait le 1er nov. 2026 (DELIVERY-13.md, X-15) : quatre parcours Playwright (demande refusée par la règle du PDE, check-list avant le démarrage, assistant, menu du coordinateur) joués en CI après le contrôle de fumée. · Attend : Responsable produit (hors demande initiale) · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

### 2.2 Connexion, profils et visibilité (0 restants, 2 faits)

**~~CR-005 · Profils, portées et visibilité (U-3)~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 1)**  
9 profils, portées global / entité / installation / projet, filtres SQL ; un partenaire ne voit que les installations partagées et ses projets ; projets confidentiels réservés à leur équipe.  
*Avancement : src/domain/rights.ts, src/server/dal/visibility.ts. · Sources : docs/spec/01-profils-droits.md*

**~~CR-006 · Administration : comptes, rôles, entités, sites, installations, projets~~** — *Prochaine étape · non commencé · effort S* · **fait (Livraison 1)**  
Écritures validées côté serveur et auditées ; projets et classe de priorité par la direction R&D.  
*Avancement : src/features/admin/. · Sources : docs/spec/05-ecrans.md*

### 2.3 Moyens d’essais, règles et réservations (1 restants, 7 faits)

**CR-076 · Consommables et stock liés aux essais (quantités, péremption, alertes)** — *À décider · non commencé · effort M*  
P2, avancé (Labguru, QReserve). Consommables requis par type d’essai, quantités décomptées à la réservation ou à la fin de l’essai, lots et dates de péremption, alertes de seuil et de péremption, réservation signalée quand le stock manque. Aujourd’hui absent.  
*Avancement : Consigné le 26 oct. 2026 (analyse comparative) ; à valider avant de construire (question X-n à ajouter à DECISIONS.md si retenu). · Attend : Responsable produit (hors demande initiale) · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**~~CR-010 · Moyens d’essais, zones du PDE, calendriers, indisponibilités, contrôles~~** — *Prochaine étape · non commencé · effort L* · **fait (Livraison 2)**  
Installations, moyens réservables (zones du PDE : atelier mécanique, pilote, pièces laboratoire), horaires, maintenances, contrôles échus bloquants (R-6).  
*Avancement : Moyens, zones du PDE, horaires, fermetures, indisponibilités, contrôles (R-6) ; fiche /facilities/[code]. · Sources : docs/spec/02-objets.md §1–2*

**~~CR-011 · Règles d’exclusion validées par la sécurité~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 2)**  
Une zone du PDE active à la fois (P-2, R-2) ; validation par le référent sécurité (R-3), versions, référence Codex.  
*Avancement : Règles proposées, validées ou retirées par le référent sécurité ; PDE-ONE-ZONE appliquée à chaque réservation. · Sources : docs/spec/03-planification.md §3*

**~~CR-012 · Réservations manuelles et contrôle des contraintes dures~~** — *Prochaine étape · non commencé · effort L* · **fait (Livraison 2)**  
Réservation refusée avec la règle citée ; planning des moyens ; « Mon planning » (démarrer, terminer) ; réservations non tenues (A-7).  
*Avancement : Demande, confirmation, annulation, démarrer / terminer, non-tenue (A-7) ; planning des moyens ; Mon planning. · Sources : docs/spec/03-planification.md, docs/spec/05-ecrans.md*

**~~CR-071 · Occupation réelle mesurée automatiquement (kiosque, agent, interlock, badge)~~** — *Prochaine étape · non commencé · effort L* · **fait (Livraison 7)**  
P1, différenciant (Agilent iLab Kiosk / Interlock, Calira LabTrack). Mesurer l’occupation réelle sans déclaration : pointage sur une borne à l’entrée du moyen, agent sur le PC du banc, verrouillage matériel (interlock) ou lecture de badge ; rapprochement automatique avec la réservation (démarrage, fin, non-tenue A-7). Aujourd’hui démarrer / terminer sont déclaratifs à l’écran (Mon planning), sans capteur ni pointage.  
*Avancement : Bornes (/kiosk/<jeton>), API POST /api/occupancy pour agent, verrouillage ou badge, rapprochement automatique avec la réservation (début, fin, utilisation sans réservation non comptée), événements en ajout seul, onglet « Mesure de l’occupation » ; X-8 à confirmer. Reste : brancher le matériel des installations (D-1). · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**~~CR-078 · Réservations récurrentes, tampons entre réservations et délai d’anticipation minimal par moyen~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 9)**  
P2, standard (Skedda, Calpendo). Série de réservations (hebdomadaire, par campagne), temps tampon de préparation / remise en état entre deux réservations d’un même moyen, délai minimal d’anticipation et durée maximale propres à chaque moyen, contrôlés comme les autres contraintes dures. Aujourd’hui la prévenance n’existe que par accord d’entité (F-5) et chaque réservation est saisie une à une.  
*Avancement : Fait le 1er nov. 2026 (DELIVERY-9.md, X-11) : temps libre entre deux réservations, prévenance minimale et durée maximale par moyen, contraintes dures ; séries hebdomadaires (toutes ou aucune). · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**~~CR-073 · Maintenance et étalonnage des moyens : plan, échéances, alertes, blocage, piste d’audit~~** — *À décider · non commencé · effort M* · **fait (Livraison 10)**  
P2, avancé (Calira Premium, LabVantage, Labguru). Plan de maintenance préventive et d’étalonnage par moyen (périodicité, prochaine échéance, prestataire), alertes avant l’échéance, blocage automatique des réservations à l’échéance dépassée, historique des interventions auditable. Aujourd’hui seuls les contrôles réglementaires périodiques existent (R-6, lecture Vigie V-1).  
*Avancement : Fait le 1er nov. 2026 (DELIVERY-10.md, X-12) : plans de maintenance et d’étalonnage par moyen, interventions en ajout seul, blocage à l’échéance dépassée (plan bloquant), alertes 14 jours avant. · Attend : Responsable produit (hors demande initiale) · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**~~CR-075 · Formulaires avant, pendant et après la réservation (check-list sécurité, fiche d’essai, rapport d’incident)~~** — *À décider · non commencé · effort M* · **fait (Livraison 12)**  
P2, avancé (Calira). Formulaires configurables rattachés au type d’essai ou au moyen : check-list sécurité à remplir avant de démarrer, fiche d’essai pendant, rapport de fin ou d’incident après ; réponses conservées en ajout seul et citées au journal. Aujourd’hui absent ; seul un lien vers le protocole et le rapport dans Codex.  
*Avancement : Fait le 1er nov. 2026 (DELIVERY-12.md, X-14) : check-list sécurité (obligatoire avant le démarrage à l’écran), fiche d’essai et rapport d’incident par installation, remplis depuis Mon planning, gardés tels que remplis. · Attend : Responsable produit (hors demande initiale) · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

### 2.4 Besoins des projets et anticipation (0 restants, 1 faits)

**~~CR-020 · Besoins des projets, jalons et plan de charge~~** — *Plus tard · non commencé · effort M* · **fait (Livraison 3)**  
Prévisions, demandes, délai de prévenance (F-5), plan de charge 26 semaines (F-6), goulots et creux.  
*Avancement : Jalons, catalogue des types d’essai, besoins (prévision / demande, rétro-planification sur le jalon), prévenance de 10 jours ouvrés (F-5), plan de charge sur 26 semaines puis par trimestre (goulots, creux, règle du PDE), références Codex ; goulot du PDE signalé 8 semaines avant sur la démo. Choix à confirmer : F-11, F-12, F-13, S-7. · Sources : docs/spec/03-planification.md §6*

### 2.5 Proposition de créneaux et arbitrages (0 restants, 1 faits)

**~~CR-030 · Moteur de proposition, conflits et arbitrages~~** — *Plus tard · non commencé · effort L* · **fait (Livraison 4)**  
Personnes et compétences, substitutions validées, heuristique déterministe (T-3), fiches de conflit, règles de priorité versionnées (A-1, A-2).  
*Avancement : Personnes et compétences (lecture de Cursus quand la vue est accordée), exigences des types d’essai, équipements mobiles, substitutions validées (R-4), règles de priorité versionnées, moteur déterministe qui propose seulement (passage quotidien), acceptation par lot après un nouveau contrôle, fiches de conflit avec options, règle citée et recommandation, arbitrages en ajout seul, veto sécurité. Propriété vérifiée sur 60 scénarios aléatoires. Choix à confirmer : R-11, A-9, F-14. · Sources : docs/spec/03-planification.md §4–5*

### 2.6 Aléas, scénarios et pilotage (3 restants, 4 faits)

**CR-070 · Pilote (4 semaines d’usage réel)** — *Prochaine étape · attend le responsable produit · effort M* · **en cours (Pilote)**  
Laboratoire 67 et PDE (P-3) : Crucible référence des réservations, mesure de référence comparée au pilote (X-2), revue hebdomadaire, bilan (P-10). Analyse comparative du 25 oct. 2026 : prérequis bloquant confirmé — le pilote reste le passage obligé avant toute extension fonctionnelle issue de l’analyse (CR-071 à CR-083) ; démarrage conditionné à l’hébergement, à Entra réel et aux données D-1 à D-11.  
*Avancement : Écran Pilote prêt : premier jour, liste de contrôle du démarrage, mesure de référence comparée au pilote. Démarrage à la levée des prérequis de docs/PILOTE.md §2. · Attend : Atelier et données D-1 à D-11 ; DSI (hébergement T-6, inscription Entra) ; Matrix (M-6) · Sources : docs/PILOTE.md, docs/PLAN.md*

**CR-074 · Refacturation interne : tarifs par moyen et par entité, coût des heures réservées et réelles, relevés par projet** — *À décider · non commencé · effort M*  
P2, avancé (QReserve, Agilent iLab). Grille tarifaire par moyen et par entité (laboratoire 67 partagé avec EPC France), valorisation des heures réservées et réalisées, relevé de refacturation par projet et par période, export vers la comptabilité. Aujourd’hui Crucible ne connaît que le coût d’acquisition de l’installation et la valeur de la capacité inoccupée (P-8).  
*Avancement : Consigné le 26 oct. 2026 (analyse comparative) ; à valider avant de construire (question X-n à ajouter à DECISIONS.md si retenu). · Attend : Responsable produit (hors demande initiale) · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**CR-077 · Rapports PDF et tableaux de bord exportables vers la BI** — *À décider · non commencé · effort M*  
P2, standard. Rapports périodiques en PDF (occupation, attente par entité, retards imputables, bilan du pilote) et exposition des indicateurs à un outil de BI (vue ou extraction planifiée) en plus du CSV. Aujourd’hui seul l’export CSV des écrans existe.  
*Avancement : Consigné le 26 oct. 2026 (analyse comparative) ; à valider avant de construire (question X-n à ajouter à DECISIONS.md si retenu). · Attend : Responsable produit (hors demande initiale) · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**~~CR-013 · Pilotage de l’occupation et import de l’historique~~** — *Prochaine étape · non commencé · effort M* · **fait (Livraison 2)**  
Occupation réservée / réalisée / avec préparation / blocage (P-5), attente par entité, mesure de référence (X-2, F-9).  
*Avancement : Pilotage /dashboard (réservé, réalisé, avec préparation, blocage, attente par entité, quotas) ; import de l’historique (F-9). · Sources : docs/spec/02-objets.md §6*

**~~CR-041 · Interface fidèle à Keystone~~** — *Prochaine étape · non commencé · effort S* · **fait (Livraison 5b)**  
Menu par thèmes, section Installation, en-tête de Keystone, panneaux latéraux, écrans refaits d’après les maquettes validées (X-5, X-6).  
*Avancement : Menu par thèmes, ⌘K, sélecteur d’installation et onglets ; recherche globale, cloche, date d’état, FR / EN, export CSV ; formulaires en panneaux ; accueil, À trancher, planning, plan de charge, propositions, conflits, aléas, fiche d’installation. · Sources : docs/DELIVERY-5b.md, https://claude.ai/artifact/NCPJzxcCPuXWFxPL36CvJS*

**~~CR-072 · E-mail vérifié (SMTP ou Microsoft Graph) et synchronisation Outlook / Teams des réservations~~** — *Prochaine étape · attend un système externe · effort M* · **fait (Livraison 7)**  
P1, standard (Calira, QReserve, Ganttic). Envoyer réellement les notifications (relais SMTP du groupe ou Microsoft Graph) et proposer les réservations dans Outlook / Teams : invitations .ics à la confirmation, mise à jour et annulation, abonnement calendrier par moyen ou par personne. Aujourd’hui le transport e-mail est « none » ou « file » (dépôt sur disque) et aucun export calendrier n’existe.  
*Avancement : Transports smtp (relais du groupe) et graph (Microsoft Graph sendMail), invitations .ics jointes (REQUEST puis CANCEL), abonnements Outlook / Teams par personne ou par moyen avec ses droits ; X-9 à confirmer. Activation : relais SMTP ou application Graph à obtenir de la DSI. · Attend : DSI (relais SMTP ou application Graph) · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**~~CR-040 · Aléas, replanification, scénarios et notifications~~** — *Plus tard · non commencé · effort M* · **fait (Livraison 5)**  
Scénario de reprise, avant / après par projet, urgences (A-8), cloche et e-mail (F-8).  
*Avancement : Aléas (panne, absence) et scénario de reprise avant / après par projet décidé par le coordinateur ou la direction R&D ; simulations « et si ? » ; urgences (A-8) ; cloche et e-mail, relances d’arbitrage, récapitulatif hebdomadaire ; instantanés hebdomadaires, valeur inoccupée, retards imputables ; vue pub_occupation_hebdo. · Sources : docs/spec/03-planification.md §7*

### 2.7 Assistant IA (1 restants, 1 faits)

**CR-051 · Activer Claude pour l’assistant** — *Plus tard · attend le responsable produit · effort S*  
Poser CRUCIBLE_AI=claude et ANTHROPIC_API_KEY une fois le fournisseur et la région d’hébergement validés par la DSI (I-3) ; confirmer le modèle (I-6) et la conservation des échanges (I-5). Analyse comparative du 25 oct. 2026 : écart P3 (différenciant) — l’assistant répond par gabarits locaux tant que Claude est désactivé ; une fois activé, étendre l’assistant à la prévision de charge (tendances d’occupation, risques de goulot à venir) en lecture seule, le moteur restant seul à proposer.  
*Attend : DSI (fournisseur et région, I-3) · Sources : docs/DELIVERY-6.md, docs/DECISIONS.md*

**~~CR-050 · Assistant IA~~** — *Plus tard · non commencé · effort M* · **fait (Livraison 6)**  
Assistant adossé au moteur, sans écriture seule (I-1 à I-4) ; fournisseur à valider.  
*Avancement : Panneau sur chaque écran : trace du moteur, conflits et compte rendu d’arbitrage, alternatives validées, risques de charge, simulation, brouillon de besoin ; gabarits sans IA ; échanges conservés en ajout seul et cités au journal. Claude prêt mais désactivé (CR-051). · Sources : docs/spec/04-assistant-ia.md, docs/DELIVERY-6.md*

### 2.8 Liens avec les autres outils (3 restants)

**CR-081 · Résultats d’essais et cahier de laboratoire (ELN) rattachés à la réservation** — *À décider · non commencé · effort L*  
P3, avancé (Benchling + Calira, Labguru). Rattacher à chaque réservation les résultats bruts, le cahier de laboratoire et le rapport, ou s’intégrer à un ELN. Hors périmètre déclaré au cadrage : Codex reste le référentiel documentaire et Crucible n’en garde que les liens ; à décider avant tout développement.  
*Avancement : Consigné le 26 oct. 2026 (analyse comparative) ; à valider avant de construire (question X-n à ajouter à DECISIONS.md si retenu). · Attend : Responsable produit (hors périmètre déclaré) · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

**CR-060 · Connecteurs Keystone, Cursus, Vigie, Codex** — *Plus tard · attend un système externe · effort L* · **en cours (Livraisons 3, 4, 8)**  
Jalons Keystone (K-2), habilitations et absences Cursus (CU-1, CU-2), contrôles et coactivité Vigie (V-1, V-2), documents Codex (CX-1, CX-2) ; vues pub_ publiées. Analyse comparative du 25 oct. 2026 : écart P1 (niveau standard du marché) — les vues attendues ne sont pas encore lues (jalons Keystone K-2, absences Cursus CU-1, contrôles Vigie V-1/V-2, documents Codex) ; tant qu’elles ne le sont pas, les jalons, absences et contrôles sont saisis deux fois (src/config/connectors.ts). Brancher les lectures dès que les vues sont accordées met fin aux doubles saisies.  
*Avancement : Vues publiées pub_moyens et pub_reservations (droits posés par Matrix ; copie dans partage/80-crucible.sql : demande M-7 à valider) ; écran des connecteurs. Demandes transmises le 22/10 : Keystone K-2 (pub_jalons), Cursus CU-1 (pub_absences), Vigie V-1 (pub_controles). Lectures à brancher quand les vues seront publiées. Livraison 4 : lecture des titres de cursus.pub_titres_detenus (compétences rattachées à un titre, personnes avec matricule) dès que la vue est accordée. Livraison 8 (31 oct. 2026, DELIVERY-8.md) : jalons keystone.pub_jalons, absences cursus.pub_absences et contrôles vigie.pub_controles lus toutes les heures (tâche connectors-read) et à la demande ; ce qui est lu se modifie dans son outil. 1er nov. 2026 : état des références Codex lu à l’affichage dans codex.pub_documents (révision en vigueur, inconnu, obsolète, archivé). Restent : suspensions Vigie (V-2, vue pas encore publiée), projets, salariés et sites. · Attend : Keystone, Cursus, Vigie, Codex · Sources : docs/DEMANDES-\*.md*

**CR-083 · API REST et webhooks pour les systèmes de bancs** — *Plus tard · non commencé · effort L*  
P3, standard (QReserve, Calira). API authentifiée pour lire les réservations et les moyens et déclarer un démarrage, une fin ou un incident depuis un automate de banc ; webhooks à la confirmation, au déplacement et à l’annulation. Aujourd’hui aucune API métier : les échanges passent par les vues pub_ et le CSV.  
*Avancement : Consigné le 26 oct. 2026 (analyse comparative) ; à valider avant de construire (question X-n à ajouter à DECISIONS.md si retenu). · Sources : Analyse comparative avec les solutions du commerce, 25 oct. 2026*

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

- 2026-11-01 — Livraison 13 (CR-080, « lance le prochain point ») : parcours de bout en bout dans le navigateur (Playwright) joués en CI. X-15 ajoutée (défaut appliqué).
- 2026-11-01 — Livraison 12 (CR-075, « lance le prochain point ») : formulaires de réservation par installation — check-list sécurité avant le démarrage, fiche d’essai, rapport d’incident ; gardés tels que remplis. X-14 ajoutée (défaut appliqué). 390 tests.
- 2026-11-01 — Livraison 11 (CR-079, « lance le prochain point ») : limitation des tentatives sur la connexion, la recherche, les exports, l’assistant, les appareils et les abonnements ; dépassements journalisés. X-13 ajoutée (défaut appliqué). 383 tests.
- 2026-11-01 — Livraison 10 (CR-073, « lance le prochain point ») : plans de maintenance et d’étalonnage par moyen, interventions gardées telles qu’enregistrées, blocage des réservations à l’échéance dépassée, alertes aux responsables 14 jours avant. X-12 ajoutée (défaut appliqué). 378 tests.
- 2026-11-01 — Livraison 9 (CR-078, « lance le prochain point ») : limites par moyen (temps libre entre deux réservations, prévenance minimale, durée maximale) contrôlées comme contraintes dures ; réservations répétées chaque semaine, toutes ou aucune. X-11 ajoutée (défaut appliqué). 371 tests.
- 2026-11-01 — CR-060, suite (« lance le prochain point », choix « fin de CR-060 ») : les références Codex (protocoles, rapports, analyses de risque, justifications de substitution) affichent l’état de leur document lu dans codex.pub_documents — révision en vigueur, ou inconnu, obsolète, archivé, sans révision en vigueur. 362 tests.
- 2026-10-31 — Livraison 8 (CR-060, « lance le prochain point ») : jalons de Keystone, absences de Cursus et contrôles de Vigie lus toutes les heures dès que leurs vues sont accordées, et à la demande depuis l’écran Connecteurs ; plus de double saisie. X-10 ajoutée (défaut appliqué). 358 tests.
- 2026-10-31 — Décision M-17 de Matrix appliquée (demande de Matrix du 30/10, acceptée le 31/10) : inventaire des échanges (docs/ECHANGES.md : 10 vues lues, 1 écriture par API chez Matrix, 4 vues publiées, aucune écriture reçue, aucun accès non conforme), règles reprises dans CLAUDE.md et les demandes à Matrix (plus de copie de vue, liens du registre matrix.liens, fonctions pub_ pour les écritures reçues).
- 2026-10-30 — Sécurité : zod 4.6.5 → 4.6.7 (avis GHSA-mrhx-c7xc-m3w5, épuisement mémoire sur de très grandes collections) ; plus aucune faille dans les dépendances de production (npm audit --omit=dev).
- 2026-10-29 — Livraison 7 : CR-071 (occupation mesurée par borne, agent, verrouillage ou badge) et CR-072 (e-mail SMTP ou Microsoft Graph, invitations et abonnements Outlook / Teams) faits ; X-8 et X-9 ajoutés, réponse par défaut appliquée.
- 2026-10-26 — Analyse comparative avec les solutions du commerce (25 oct. 2026) : 13 items ajoutés (CR-071 à CR-083), 4 annotés (CR-007, CR-051, CR-060, CR-070).
- 2026-10-25 — Exploitation : ligne de dépannage « Bad Gateway » (domaine Coolify sans :3500) dans docs/EXPLOITATION.md §4.1, après la panne du 24 oct. 2026.
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
