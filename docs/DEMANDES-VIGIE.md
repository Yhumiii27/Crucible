# Demandes de Crucible à Vigie

> 22 oct. 2026. Crucible ne modifie jamais le dépôt Vigie : ces demandes sont à transmettre par le responsable produit.
>
> **Transmise** (validée par le responsable produit le 22/10/2026) : V-1, entrée du `REQUESTS.md` de Vigie
> (Yhumiii27/Vigie#12, en attente de fusion), statut OUVERTE. Livraison 3 : `crucible.pub_reservations` et `pub_moyens` sont
> publiées (V-3 côté Crucible fait ; droits de Vigie déjà posés par Matrix).

| # | Demande | Pourquoi | Bloque | Décision liée |
|---|---|---|---|---|
| V-1 | Publier les **contrôles périodiques** : vue `pub_controles` (`vigie_ref`, `site_code`, `equipement`, `equipement_code` — code commun avec les moyens de Crucible, colonne nouvelle —, `type_controle`, `periodicite_mois`, `dernier_le`, `prochain_le`, `reserves`, `archive`, `maj_le`) | un contrôle échu bloque le moyen d’essai (R-6) | L2 (saisie locale en attendant), L5 | S-4, R-6 |
| V-2 | Publier les **activités de coactivité** qui suspendent les essais (zones `essais` / `atex`, mesure « essais suspendus pendant l’intervention ») : vue `pub_suspensions_essais` (`zone`, `site_code`, `du`, `au`, `entreprise`, `motif`, `maj_le`) | une intervention extérieure rend un moyen indisponible | L5 | R-7 |
| V-3 | Lire `crucible.pub_reservations` (et `pub_moyens`) pour la détection de coactivité et les plans de prévention (EPC France au laboratoire 67) | sécurité : coactivité entre entités | L3 | R-7, S-5 |
| V-4 | Rattacher les zones de la carte du site aux moyens de Crucible (code de moyen sur `map_zones`, colonne nouvelle) | afficher les moyens sur la carte, coactivité par zone | après L5 | — |
