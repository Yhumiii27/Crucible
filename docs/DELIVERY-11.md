# Livraison 11 — limitation des tentatives (CR-079)

> 1er nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « lance le prochain point du reste à
> faire », choix CR-079 (ajout de l’analyse comparative du 25 oct. 2026, approuvé par ce choix). Relecture du questionnaire
> avant la livraison : aucune nouvelle réponse. Nouvelle question **X-13** ([`DECISIONS.md`](DECISIONS.md) §10), réponse
> par défaut appliquée, à confirmer.

## 1. Ce qui est limité

| Où | Compté par | Limite | Au-delà |
|---|---|---|---|
| Connexion Microsoft Entra (début et retour) | adresse | 30 par 10 min | 429 « Too many requests », `Retry-After` |
| Recherche globale de l’en-tête | personne | 120 par minute | aucun résultat |
| Exports CSV | personne | 30 par 10 min | 429 |
| Questions à l’assistant | personne | 30 par 10 min | « Trop de questions : réessayez dans quelques minutes » |
| Appareils d’occupation (`POST /api/occupancy`) | adresse | 600 par 10 min | 429 (JSON) |
| Abonnements d’agenda (`GET /api/calendar`) | adresse | 120 par 10 min | 429 |

- **Fenêtres fixes comptées en base** (`rate_counters`, une ligne par compteur, clé et fenêtre ; une seule écriture atomique
  par requête, hors verrou d’écriture) : toutes les instances partagent les mêmes compteurs. Purge quotidienne des fenêtres
  finies depuis un jour (tâche `rate-counters-purge`).
- **Adresse** : celle que le proxy inverse (Traefik, Coolify) a vue — la dernière entrée de `X-Forwarded-For`, qu’il ajoute
  (les précédentes sont ce que le client a écrit), sinon `X-Real-IP`. Sans en-tête de proxy (poste de développement, tests),
  rien n’est compté par adresse.
- **Journal** : le premier dépassement d’une fenêtre est écrit au journal d’audit (domaine « Security », objet
  « Limit <compteur> ») et dans les journaux de l’application ; les suivants de la fenêtre sont refusés sans trace.
- Seuils dans `src/domain/rate-limit.ts` (`RATE_LIMITS`), à ajuster au pilote.

## 2. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **383 tests** sur PostgreSQL 16, dont 5 nouveaux (fenêtres,
  temps restant, adresse vue par le proxy ; compteur en base : limite, refus, un seul audit par fenêtre, clés et compteurs
  distincts, nouvelle fenêtre, purge).
- Build de production et `npm run test:smoke` ; essai sur le serveur de production : 120 lectures d’abonnement depuis une
  adresse, puis 429.
- Migration `0018_rate_limits` (générée). Les vues `pub_` ne changent pas.
