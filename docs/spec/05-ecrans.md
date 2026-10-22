# 05 — Écrans (proposition)

> Proposition (livraison 0). Design Nocturne (repris de Keystone, comme Arche). Les écrans arrivent avec les livraisons
> indiquées ([`../PLAN.md`](../PLAN.md)).

| Écran | Contenu | Profils | Livraison |
|---|---|---|---|
| **Accueil** | mes prochaines réservations, mes demandes en attente, conflits à arbitrer, alertes (goulots, contrôles échus) | tous | L1 |
| **Planning des moyens** | vue type Gantt par moyen (jour / semaine / mois), exclusions visualisées (bandes « bloqué par… »), indisponibilités, filtre par installation et entité | tous (selon portée) | L2 |
| **Fiche moyen** | caractéristiques, calendrier, maintenances et contrôles, substitutions, règles qui le concernent, occupation | tous | L2 |
| **Règles** | règles d’exclusion (avec validation sécurité), substitutions, priorités, accords d’entités ; historique des versions | coordinator, safety, rd_director | L2 |
| **Mes besoins** | prévisions et demandes de mes projets, état, créneaux proposés à accepter | project_lead, partner | L3 |
| **Plan de charge** | charge prévisionnelle par moyen et par semaine (12 à 26 semaines), goulots et creux | coordinator, rd_director, facility_manager | L3 |
| **Proposer** | lancement du moteur sur une période, propositions avec explication, acceptation par lot | coordinator | L4 |
| **Conflits** | liste et fiche de conflit (options, conséquences par projet, règle, recommandation), arbitrage | coordinator, rd_director | L4 |
| **Aléas et scénarios** | déclaration d’aléa, scénario de reprise, avant / après, simulations « et si ? » | coordinator ; simulation pour project_lead | L5 |
| **Pilotage** | occupation (réservé / réalisé / blocage), attente par entité, retards imputables, valeur inoccupée, tendance | rd_director, coordinator, facility_manager | L2 (mesure) puis L5 |
| **Mon planning** (mobile) | essais du jour, démarrer / terminer, déclarer un aléa | technician | L2 |
| **Assistant** | panneau de conversation disponible sur chaque écran | tous | L6 |
| **Administration** | comptes, rôles, référentiels, paramètres, connecteurs, santé | admin | L1 |
