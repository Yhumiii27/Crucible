# Livraison 5b — interface fidèle à Keystone

> 23 oct. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit du 23 oct. 2026 (« même réflexion que sur
> Arche : ce n’est pas fidèle à ce que l’on a fait sur Keystone en termes de design ») ; maquettes validées le même jour
> (https://claude.ai/artifact/NCPJzxcCPuXWFxPL36CvJS). Ajouts X-5 et X-6 dans [`DECISIONS.md`](DECISIONS.md) §10 ; reprises de
> plateforme d’Arche (`3d41e8f`) et de Keystone (`f8664df`) dans [`SOCLE.md`](SOCLE.md).

## 1. Ce qui est livré

| Domaine | Contenu | Où |
|---|---|---|
| Menu | recherche de page ⌘K ; entrées fixes (Accueil, Mon planning, Mes besoins d’essais, **À trancher** avec son compteur) ; sections repliables mémorisées (cookie `crucible-nav`), entrées **regroupées par thèmes** (Planning et charge · Propositions et arbitrages), compteurs (propositions ouvertes, conflits) | `src/config/screens.ts` (`group`, `nav`), `src/components/app/shell/{nav-model.ts,sidebar.tsx}` |
| Section Installation | toujours là pour les profils qui voient les fiches : **sélecteur d’installation** repris du sélecteur de projet de Keystone (mes installations / tout ce que je vois, recherche, même onglet de l’installation choisie ; dernière utilisée : cookie `crucible-facility`) et les onglets de la fiche | `src/config/facility-tabs.ts` |
| En-tête de page | fil d’Ariane et titre, puis les outils de Keystone : **recherche globale** (installations, moyens, projets, besoins, réservations, aléas, scénarios, conflits — seulement ce que la personne voit, U-3), **cloche** et ses dernières notifications, **date d’état**, **FR / EN**, **Exporter** (CSV de la vue : planning de la semaine, plan de charge, propositions, conflits, aléas, À trancher) ; sous l’en-tête, les filtres et la navigation de période à gauche, les actions de la page à droite | `page-header.tsx`, `header-tools.tsx`, `src/server/actions/search.ts`, `src/app/api/export/[screen]/route.ts`, `src/server/export/views.ts`, `src/lib/csv.ts` |
| Panneaux latéraux | chaque formulaire devient un **bouton qui ouvre un panneau** ; le panneau se ferme et un avis confirme quand l’action réussit (avertissements compris) | `src/components/app/ActionForm.tsx` (`Folded`) |
| À trancher | conflits à arbitrer (le référent sécurité : ceux à examiner pour un veto), scénarios soumis, propositions du dernier passage, besoins non placés, avec l’action qui règle chacun | `/my/decisions`, `src/server/dal/decisions.ts`, `src/features/decisions/` |
| Accueil | bonjour, profil et date ; chiffres cliquables ; « À trancher » ; charge des moyens sur 8 semaines en carte de chaleur ; essais des 7 prochains jours | `src/app/(app)/page.tsx` |
| Planning des moyens | filtre par installation, navigation de semaine, chiffres de la semaine, **avertissement** pour une demande qu’une règle validée refusera à la confirmation, « Demander un créneau » et « Importer l’historique » en panneaux | `/planning` |
| Plan de charge | **carte de chaleur** des 8 semaines (navigation sur les 26) ou enveloppes par trimestre, **capacité vs demande** par installation (par la règle d’exclusion pour le PDE), goulots, contrôles à renouveler, place à proposer | `/load`, `src/features/load/` |
| Propositions | filtres à compteurs (toutes, à l’heure, en retard, sur substitution), lignes sur deux niveaux avec retard en étiquette et « Refuser » sur la ligne, moteur relancé depuis l’en-tête | `/propose` |
| Conflits | faits de la fiche (règle citée, décideur, échéance, retard comme proposé → recommandé), **options côte à côte**, la recommandée soulignée, puis la décision | `/conflicts` |
| Aléas | « Déclarer un aléa », « Déclarer une urgence », « Simuler « et si ? » » en panneaux ; chaque scénario en carte : chiffres, avant → après, décision | `/incidents` |
| Fiche d’installation | étiquettes à côté du titre, bandeau **« Prochaine étape »** quand un contrôle arrive à échéance, onglets (moyens et zones, calendrier et indisponibilités, contrôles, équipements) avec leurs actions dans l’en-tête | `/facilities/[code]?tab=` |
| Autres écrans | personnes, règles, projets, besoins, administration : formulaires de création en boutons et panneaux | — |

## 2. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **297 tests** sur PostgreSQL 16, dont le modèle du menu
  (thèmes, section Installation, onglets, sélecteur), le CSV, et 7 tests d’intégration : décisions attendues par profil, recherche
  globale sous U-3 (un partenaire ne trouve rien du PDE ; une réservation d’un projet confidentiel par sa seule référence), export
  CSV (en français, droits revérifiés, 404 hors de l’espace de travail, masques du planning d’un partenaire).
- Build de production, `npm run test:smoke` : **50 contrôles HTTP** (menu et en-tête, À trancher, onglets, navigation du plan de
  charge, export).
- Navigateur (build de production) : chaque écran comparé aux maquettes ; déclaration d’un aléa par le panneau latéral (le
  scénario de reprise apparaît, la cloche du coordinateur le signale), recherche globale, menu de la cloche.

## 3. Limites

- L’export est en CSV (séparateur point-virgule, lisible par Excel en français) ; pas encore de fichier Excel ni de rapport PDF
  comme dans Keystone.
- La colonne « occupation » de la fiche d’installation de la maquette n’est pas reprise : l’occupation par moyen reste sur le
  pilotage de l’occupation.
- « Mon planning » (écran mobile du technicien) garde ses actions sur la carte de chaque essai, sans panneau.
