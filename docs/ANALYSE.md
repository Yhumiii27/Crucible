# Crucible — analyse du besoin et état des lieux des outils du groupe

> 22 oct. 2026 — livraison 0 (cadrage). Ce document répond à la demande initiale des équipes R&D (§1), dit si l’outil est
> faisable et sous quelle forme (§2–§4), relève ce que font déjà Keystone, Arche, Vigie, Cursus, Codex et Matrix et ce que
> Crucible en reprend (§5), puis liste les données nécessaires (§6) et les risques (§7). Les questions au responsable
> produit sont dans [`DECISIONS.md`](DECISIONS.md) et dans le questionnaire « Décisions Crucible ».

## 1. La demande, reformulée

**Constat des équipes R&D**

- Des moyens d’essais **partagés** entre plusieurs équipes projet : le **laboratoire 67** (partagé avec **EPC France**),
  le **PDE**, le **laboratoire PDE** et l’**atelier mécanique**.
- Les équipes **se disputent les créneaux** ; une **priorité de fait** semble donnée à EPC France ; des projets prennent
  du **retard faute d’accès** au bon moment.
- Un **défaut d’anticipation** des besoins.
- Un **paradoxe** : le PDE (≈ 3 M€) serait occupé à **≈ 30 %**, alors que des projets attendent.
- Des **contraintes de sécurité** : le PDE, le laboratoire PDE et l’atelier mécanique **ne peuvent pas tous fonctionner en
  parallèle** ; règles exactes et substitutions possibles **à clarifier**.

**Attendus** (« au-delà de la simple réservation »)

| # | Attendu | Traduction fonctionnelle dans Crucible |
|---|---|---|
| E1 | Anticiper les besoins de chaque projet à partir de ses échéances et de ses essais | plan de charge prévisionnel par moyen, rétro-planification depuis les jalons (spec 03 §6) |
| E2 | Proposer des créneaux compatibles avec les contraintes et la disponibilité des équipes | moteur de proposition sous contraintes dures (spec 03 §3) |
| E3 | Arbitrer les conflits selon des règles explicites, les marges et les risques de retard | fiche de conflit avec options chiffrées et règle appliquée ; décision humaine tracée (spec 03 §5) |
| E4 | Identifier des alternatives sur d’autres moyens, techniquement possibles **et validées** | matrice de substitution validée (spec 02 §1) |
| E5 | Replanifier en cas d’aléa en rendant visibles les conséquences | aléas, scénario de reprise, avant/après par projet, notifications (spec 03 §7) |
| E6 | Réduire attentes et retards, améliorer l’utilisation, respecter la sécurité | indicateurs mesurés (spec 02 §6), objectif hiérarchisé (spec 03 §4) |
| E7 | Aider à choisir le meilleur compromis quand tout ne tient pas | scénarios comparés, arbitrage anticipé 4 à 12 semaines avant |
| E8 | « Éventuellement sous forme d’agent IA » | assistant qui dialogue, explique et prépare, adossé à un moteur déterministe (spec 04) |

## 2. Faisabilité : oui, et voici pourquoi

1. **Le problème est classique.** Planifier des essais qui demandent en même temps un moyen, des personnes qualifiées et
   le respect de règles d’exclusion est un problème d’ordonnancement à ressources limitées. Il est bien connu et bien
   outillé. À l’échelle d’EPC (quelques dizaines de moyens, quelques centaines d’essais par trimestre), une heuristique
   déterministe donne de bonnes propositions en moins d’une seconde ; un solveur de contraintes (OR-Tools) n’est utile que
   pour optimiser un trimestre entier.
2. **La difficulté n’est pas l’algorithme, ce sont les données et les règles.** Aujourd’hui les règles d’exclusion, les
   substitutions, les priorités et même la définition du taux d’occupation ne sont pas écrites. Le premier livrable de
   valeur est de les **écrire, les faire valider et les rendre visibles**.
3. **Le groupe a déjà la plateforme.** Crucible reprend le socle de Keystone (comme Arche l’a fait le 22 oct. 2026) :
   connexion Entra, droits, audit append-only, i18n, PostgreSQL commun, vues `pub_`, worker, sauvegardes, CI. Keystone
   contient même un moteur de chemin critique, des calendriers et une gestion des conflits arbitrés (§5.1) dont on peut
   reprendre les **principes** (pas le code métier, règle A-3 d’Arche).
4. **L’IA a sa place, mais pas comme décideur.** Un agent IA qui « choisit » le planning serait inexplicable et
   difficile à faire accepter, surtout entre deux entités (EPC2i et EPC France) et avec des contraintes de sécurité. La
   proposition : un **moteur déterministe** qui calcule et un **assistant IA** qui reçoit les demandes en langage naturel,
   explique les propositions et les conflits, simule des « et si ? » et prépare les arbitrages (spec 04). L’assistant
   n’écrit rien sans validation humaine.

**Conclusion** : faisable, en commençant par la **visibilité** (référentiel, règles, réservations, occupation réelle)
avant l’**intelligence** (proposition, arbitrage, replanification, assistant). Un premier atelier avec les équipes est
indispensable : son guide est [`ATELIER-CADRAGE.md`](ATELIER-CADRAGE.md).

## 3. Lecture du paradoxe « PDE à 30 % mais des projets en retard »

Plusieurs causes possibles, non exclusives. Crucible doit permettre de **les distinguer**, ce que personne ne peut faire
aujourd’hui. Chacune appelle une réponse différente :

| Cause possible | Signe dans les données | Réponse de Crucible |
|---|---|---|
| Le PDE est **bloqué** par l’exclusion entre ses zones (atelier mécanique, pilote, pièces laboratoire : une seule active à la fois, P-2) | heures libres mais bloquées | taux de blocage ; regroupement des activités exclusives ; règle d’exclusion affinée (par type d’activité plutôt que totale) |
| **Personnel** : peu de personnes habilitées pour le PDE | créneaux libres sans opérateur | planification conjointe moyen + personnes ; besoin de formation visible |
| **Réservations non tenues** ou surréservations « de précaution » | réservé ≫ réalisé | statut `no_show`, délai de libération, quota de réservation |
| **Temps de préparation** non comptés (montage, sécurisation, remise en état) | réalisé court, occupation réelle plus haute | occupation « réalisé + préparation » |
| **Mauvaise adéquation** : les projets attendent un autre moyen que le PDE | file d’attente sur le labo 67, PDE libre | substitutions validées vers le PDE ; charge prévisionnelle |
| **Mesure** : 30 % de quoi ? (heures calendaires, heures ouvrées, jours) | — | définition écrite de l’occupation (question P-5) |
| **Priorité implicite** d’EPC France sur le laboratoire 67 | attente plus longue pour les autres entités | règles écrites, quota, indicateur d’attente par entité |

## 4. Ce que Crucible n’est pas (frontières proposées)

- **Pas un outil de gestion de projet** : les projets, leurs jalons et leurs plannings détaillés restent dans Keystone
  (ou dans l’outil des projets R&D, question S-1). Crucible lit les échéances et planifie **les moyens d’essais**.
- **Pas un outil QHSE** : analyses de risque, permis, plans de prévention, contrôles réglementaires restent dans Vigie.
  Crucible applique les règles d’exclusion **validées par la sécurité** et lit l’état des contrôles quand Vigie le
  publie.
- **Pas un outil RH** : habilitations et absences appartiennent à Cursus ; Crucible les lit (ou les saisit localement
  en attendant).
- **Pas une GED** : modes opératoires, rapports d’essai, justifications de substitution sont dans Codex ; Crucible garde
  des références.
- **Pas un LIMS** (gestion des échantillons et des résultats d’essais) : hors périmètre v1 (question P-4).

## 5. État des lieux des outils du groupe et de leur façon de faire

### 5.1 Keystone (`Yhumiii27/Keystone`, `main` au commit `a8ba6df`)

Outil de gestion de projets et de portefeuille d’EPC2i, Next.js 16, Drizzle, PostgreSQL (schéma `keystone`), Entra ID,
design Nocturne, livraisons 1 à 8 faites.

| Ce qui existe | Où | Intérêt pour Crucible |
|---|---|---|
| Projets, nature `client` / `internal` (pas de nature « R&D ») | `src/server/db/schema/portfolio.ts`, `pub_projets.nature` | les projets R&D sont-ils dans Keystone comme projets internes ? (S-1) |
| Jalons au mois (`baseline_month`, `forecast_month`), activités datées, tâches | `schema/planning.ts`, `schema/work.ts` | **non publiés** : demande K-2 pour lire les échéances |
| Moteur de chemin critique (liens FS/SS/FF/SF, contraintes, cycles) | `src/domain/cpm.ts` | principe de la rétro-planification |
| Calendriers et exceptions, nivellement « et si ? » | `schema/scheduling.ts`, `src/domain/whatif.ts`, `calendar.ts` | modèle des calendriers et des scénarios |
| Charge par personne / métier, bandes de charge, capacité vs demande | `src/domain/planning-load.ts`, `resources.ts`, `load-week.ts` | modèle de la charge prévisionnelle |
| Allocations, compétences, certifications, congés | `schema/resources.ts` | modèle des personnes planifiables |
| Conflits de rotation de chantier **arbitrés** (surcharge, autre site, habilitation, absence), arbitrage commenté qui tient tant que la cause ne change pas, droit d’arbitrer | `src/domain/site.ts` (`siteConflicts`, `canArbitrateConflict`) | modèle direct des fiches de conflit et de leur arbitrage |
| Priorisation du portefeuille : axes, poids, scores | `schema/prioritisation.ts` | modèle des règles de priorité paramétrables |
| Aucune table de laboratoire, de banc ni de réservation d’équipement | — | Crucible ne recoupe rien d’existant |
| IA : analyse de réunions par Claude si `ANTHROPIC_API_KEY`, sinon analyseur local à règles | `src/server/ai/` | même principe pour l’assistant de Crucible (repli sans IA) |
| Vues `pub_` : `pub_projets`, `pub_chantiers`, `pub_affectations`, `pub_taches_jours`, `pub_activites` (sans dates), `pub_livrables`… | `drizzle/0035_share.sql` | Crucible lit `pub_projets` ; demandes K-1 à K-3 |
| CI économe (docs seules : pas de CI ; `main` : vérifications rapides ; PR : tout) | `.github/workflows/ci.yml` | repris |

### 5.2 Arche (`Yhumiii27/Arche`) — le modèle à suivre

Application sœur la plus récente (CAPEX des filiales), démarrée le 22 oct. 2026 exactement comme Crucible le sera :

1. **Livraison 0 — cadrage** : `docs/spec/00`–`08`, `DECISIONS.md` (questions numérotées, réponse par défaut ★, livraison
   bloquée), `CONTRATS.md` (vues `pub_`), `DEMANDES-<APP>.md` (ce qu’on demande aux autres dépôts, jamais modifiés),
   `PLAN.md`, `SOCLE.md`, questionnaire publié en artifact (réponses dans sa base, relues par Claude).
2. **Livraison 1 — socle** copié une fois de Keystone (commit d’origine noté dans `SOCLE.md`), **PostgreSQL uniquement**,
   tables déclarées dans le schéma (`arche.table(…)`), rôle `arche_app`, isolation dans la couche de données.
3. Livraisons métier avec notes `DELIVERY-<n>.md`, page « reste à développer » republiée après chaque lot, PR fusionnée
   dans `main` une fois la CI verte.

Crucible suit **la même démarche et les mêmes conventions** (ce dépôt en est la livraison 0).

### 5.3 Vigie (QHSE)

| Ce qui existe | Intérêt pour Crucible |
|---|---|
| Contrôles périodiques (`controls` : équipement en texte libre, périodicité, `next_on`, réserves) | un contrôle échu doit bloquer le moyen ; **pas d’entité équipement ni de vue publiée** → demande V-1 |
| Carte du site, zones typées dont **`atex`** et **`essais`** | les moyens de Crucible peuvent être rattachés à une zone Vigie |
| Coactivité (`detectConflicts`, fonction pure jour par jour : même zone, proximité, voie partagée ; danger si permis feu / essai ; zones `essais` et `atex` : « essais suspendus pendant l’intervention ») | **règle existante qui touche les essais** : une intervention d’entreprise extérieure dans une zone d’essais les suspend → Crucible doit le savoir (V-2). Vigie ne couvre pas l’exclusion entre deux installations internes : c’est à Crucible |
| Entreprises extérieures, **plans de prévention**, permis (`feu`, `essai`) | EPC France dans le laboratoire 67 relève-t-il d’un plan de prévention ? (R-7) ; un permis « essai » est-il exigé avant certains essais ? |
| Habilitations propres à Vigie (en attendant Cursus), exigences par personne ; analyse « AST en contexte pyrotechnique » | compétences requises par type d’essai |
| Vues `pub_` : `pub_non_conformites`, `pub_hse_projet`, `pub_journal` | rien encore sur les contrôles ni les zones |

### 5.4 Cursus (RH)

Express + React/Vite, SQLite ou PostgreSQL (schéma `cursus`). Possède salariés (matricule), équipes, formations,
**habilitations**, **absences**, feuilles de temps, missions. Publie `pub_salaries`, `pub_titres`, `pub_titres_detenus`
(habilitations détenues, date d’expiration), `pub_parametres`, `pub_journal`. **Les absences ne sont pas publiées**
(vues de contrôle réservées à Matrix) → demande CU-1. En attendant, Crucible saisit les indisponibilités des opérateurs.

### 5.5 Codex (GED)

69 types de documents, rattachements `none`, `project`, **`research`** (programme de recherche, code `program_code`).
Types utiles : RPT « Rapport d’essai », PRT « Protocole expérimental / Matrice d’essais », DBR « Cahier de laboratoire »,
PRO « Instruction de travail » (mode opératoire), MNT « Certificat d’étalonnage », PGM « Plan de recherche ». Identifiant
`TYPE-CONTEXTE-SEQ` (ex. `PRT-R2601-004`). Crucible ne stocke **aucun fichier** (même règle qu’Arche) : il garde des
références Codex (justification d’une substitution, analyse de risque d’une règle d’exclusion, protocole d’un essai,
rapport d’essai rattaché à la réservation). Les **programmes de recherche** de Codex sont une piste pour identifier les
projets R&D (S-1).

### 5.6 Matrix (socle du serveur PostgreSQL commun)

Base `epc2i`, un schéma par outil, partage par vues `pub_` dont Matrix accorde les droits ; journal unifié ; déclaration
des tables au démarrage (`/api/declarations`). Référentiels : **sites** (lyon, le_havre, marseille — **aucun site « 67 »**
ni laboratoire), organigramme (15 départements dont **RDI « Recherche & innovation »**), pays, zones et filiales (vides).
Ajouter un outil (précédent d’Arche, décision M-07) touche les rôles, le schéma, les droits, un fichier de partage, le
catalogue → demandes M-1 à M-6 de [`DEMANDES-MATRIX.md`](DEMANDES-MATRIX.md).

### 5.7 Conventions communes que Crucible reprend

- Réponses au responsable produit en français ; code, identifiants et commits en anglais ; interface en anglais source
  traduite, français par défaut, contrôle de complétude du français.
- Rien hors du cahier des charges sans accord ; les ajouts sont listés dans `DECISIONS.md` §6.
- Ce que les gens tapent s’affiche tel quel ; piste d’audit append-only ; chaque Server Function valide entrée et droits
  côté serveur ; migrations générées, jamais réécrites ; vues `pub_` = contrats (colonnes ajoutées en fin seulement).
- Règles pures dans `src/domain/` testées par valeurs ; une seule horloge métier ; indicateurs **calculés**, jamais
  stockés (Vigie).
- Jamais modifier un autre dépôt : demandes écrites dans `docs/DEMANDES-<APP>.md`.
- Chaque lot vérifié va dans `main` par une PR fusionnée une fois la CI verte.

## 6. Données nécessaires (à collecter avec les équipes)

| # | Donnée | Détenteur probable | Indispensable pour |
|---|---|---|---|
| D-1 | Liste des installations et moyens d’essai, caractéristiques, horaires, responsables | responsables des laboratoires et de l’atelier | L2 |
| D-2 | **Règles d’exclusion** et de cohabitation entre installations, avec leur motif et l’analyse de risque | sécurité pyrotechnique / QHSE | L2 |
| D-3 | Catalogue des types d’essai : durée type, préparation, compétences, moyen nominal | équipes R&D | L3 |
| D-4 | **Substitutions** techniquement validées (type d’essai × moyen) et qui les valide | responsables techniques | L4 |
| D-5 | Projets R&D en cours, jalons, plans d’essais prévus sur 6 à 12 mois | chefs de projet R&D | L3 |
| D-6 | Personnes qui réalisent les essais, habilitations, contraintes horaires | responsables de laboratoire, RH | L3 |
| D-7 | Accord avec EPC France sur le laboratoire 67 (s’il existe) : quotas, créneaux, priorités | direction R&D | L2 |
| D-8 | Historique des réservations (agendas Outlook, fichiers Excel…) sur 6 à 12 mois | planificateurs actuels | mesure de référence |
| D-9 | Calcul actuel du « 30 % » du PDE | qui l’a produit | mesure de référence |
| D-10 | Calendrier des maintenances et contrôles réglementaires des moyens | maintenance, QHSE | L2 |

## 7. Risques

| Risque | Parade |
|---|---|
| Règles non écrites, chacun a « sa » version | atelier de cadrage ; règles versionnées, validées par la sécurité, référence Codex |
| Rejet par les équipes si l’outil « décide » | moteur explicable, décision toujours humaine, fiche de conflit avec règle citée |
| Asymétrie EPC2i / EPC France (deux entités, priorité de fait) | accord écrit, règles identiques, indicateur d’attente par entité, comité d’arbitrage commun |
| Données de réservation non tenues à jour (le réel n’est pas saisi) | saisie du réel en un geste (démarrer / terminer), relance automatique, `no_show` |
| Dépendance aux autres outils (jalons Keystone, absences Cursus, contrôles Vigie) non publiés | saisie locale en attendant, connecteur avec simulation (modèle de Keystone et d’Arche) |
| Données sensibles (sécurité pyrotechnique, programmes de recherche confidentiels) | droits par entité et par projet ; IA désactivée tant qu’aucun fournisseur conforme n’est validé (I-3) |
| Faux sentiment d’optimalité | indicateurs mesurés avant / après ; pilote sur un périmètre restreint (laboratoire 67 et PDE) |
