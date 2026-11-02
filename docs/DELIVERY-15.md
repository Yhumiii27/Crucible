# Livraison 15 — API REST et webhooks des systèmes de bancs (CR-083)

> 2 nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « lance le prochain point du reste à
> faire », choix CR-083 (ajout de l’analyse comparative du 25 oct. 2026, approuvé par ce choix). Relecture du questionnaire
> avant la livraison : aucune nouvelle réponse. Nouvelle question **X-17** ([`DECISIONS.md`](DECISIONS.md) §10), réponse
> par défaut appliquée, à confirmer. Référence de l’API : [`API.md`](API.md).

## 1. Clients de l’API

- Nouvel onglet **Systèmes de bancs (API)** de la fiche d’une installation : la liste des systèmes déclarés (dernière
  lecture, dernier envoi du webhook, dernière erreur), lisible par ceux qui voient l’installation ; le **responsable de
  l’installation** (ou le coordinateur) en ajoute un, lui donne un nouveau secret de signature ou le révoque. Journalisé.
- Un client = un système d’**une** installation. Son jeton `cra_…` est affiché une fois, gardé sous forme d’empreinte
  SHA-256 (comme les appareils de mesure et les abonnements d’agenda, livraison 7).
- Le webhook est facultatif ; son secret de signature `crw_…` est affiché une fois. Il doit être relu pour signer : il est
  gardé en base, jamais réaffiché ; « Nouveau secret de signature » le remplace.

## 2. Lectures (lecture seule)

`GET /api/v1/resources`, `/api/v1/bookings?from=&to=&resource=`, `/api/v1/bookings/<réf>`, `/api/v1/events?after=` :
les moyens, les réservations (tous statuts, 186 jours au plus par lecture) et les événements de l’installation du client.
Un projet confidentiel est masqué comme dans la vue publiée `pub_reservations` (S-7) : projet, projet Keystone, objet et
opérateurs à `null`. Une réservation d’une autre installation répond 404. Limite : 600 requêtes par adresse et
10 minutes (CR-079, nouveau compartiment `api`). L’API **n’écrit rien** dans le planning ; démarrage et fin mesurés restent
sur `POST /api/occupancy` (X-8).

## 3. Événements et webhooks

- Table `api_events` (ajout seul), remplie par des **déclencheurs** sur `bookings` et `incidents`
  (`drizzle/0022_api_events_triggers.sql`), dans la transaction du changement : réservation créée ou de statut changé
  (`booking.<statut>`), déplacée (`booking.moved`, sur l’ancien et le nouveau moyen), aléa sur un moyen déclaré ou clos
  (`incident.open`, `incident.closed`). L’historique importé n’en produit pas. Les écritures de Crucible passant une à une
  (verrou d’écriture), l’ordre des numéros est celui des validations : un curseur ne saute jamais un événement.
- Tâche **`api-webhooks`** (chaque minute) : chaque client qui a une adresse reçoit les événements de son installation,
  un `POST` par événement, dans l’ordre, au moins une fois, signés (`X-Crucible-Signature: sha256=` HMAC-SHA256 de
  `"<horodatage>.<corps>"`). Échec (réponse non 2xx, redirection, réseau, 10 s) : arrêt, nouvel essai après 1, 2, 4… jusqu’à
  60 minutes. Chaque événement porte la réservation telle qu’elle est au moment de l’envoi.
- Un nouveau client part du dernier événement : pas d’arriéré.

## 4. Ce qui n’est pas fait

- Déclarer une panne depuis l’automate (écriture) : variante de X-17, à décider. Le CR-083 citait aussi « déclarer un
  démarrage ou une fin » : c’est déjà `POST /api/occupancy` (livraison 7).
- Pas de nouvelle vue `pub_` (M-18) : l’API est un service de Crucible pour les systèmes des installations, pas un échange
  entre outils.

## 5. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **409 tests** sur PostgreSQL 16, dont 12 nouveaux :
  `src/domain/api.test.ts` (déclaration, période, curseur, masquage, délais) et `src/server/api/api.test.ts` (déclaration
  et droits, déclencheurs et ajout seul, lectures limitées à l’installation et masquées, webhooks signés, reprise après
  échec, nouveau secret, révocation).
- Contrôle de fumée : 3 contrôles de plus (onglet du responsable et du technicien, `GET /api/v1/bookings` sans jeton → 401).
- Migrations `0021_api_clients` (générée) et `0022_api_events_triggers` (SQL des déclencheurs).
