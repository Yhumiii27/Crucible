# API REST et webhooks des systèmes de bancs (CR-083, X-17)

> Livraison 15 (2 nov. 2026). Pour les systèmes d’une installation : supervision de banc, LIMS, PC d’acquisition. Les
> échanges entre outils du groupe (Keystone, Cursus, Vigie, Codex, Matrix) passent, eux, par les vues `pub_` décidées par
> Matrix ([`ECHANGES.md`](ECHANGES.md)) : cette API ne les remplace pas.

## 1. Principes

- **Un client = un système d’une installation.** Le responsable de l’installation (ou le coordinateur) le déclare dans
  la fiche de l’installation, onglet **Systèmes de bancs (API)**. Le client lit **cette installation seulement** :
  ses moyens, ses réservations, ses événements. Une réservation d’une autre installation n’existe pas pour lui (404).
- **Lecture seule.** L’API n’écrit rien dans le planning : elle ne demande, ne confirme ni ne déplace aucune réservation
  (« le moteur propose, une personne décide »). Le démarrage et la fin d’un essai mesurés par un automate passent par
  `POST /api/occupancy` avec un jeton d’appareil (livraison 7, [`DELIVERY-7.md`](DELIVERY-7.md)).
- **Projets confidentiels masqués**, comme dans la vue publiée `pub_reservations` (S-7) : `project`, `keystoneProject`,
  `purpose` et `operators` valent `null`, `confidential` vaut `true`.
- **Jeton** `cra_…` (43 caractères après le préfixe), affiché une fois à la création, gardé seulement sous forme
  d’empreinte SHA-256 ; révoqué, jamais supprimé. En-tête : `Authorization: Bearer cra_…`.
- **Limite** : 600 requêtes par adresse et 10 minutes (CR-079) ; au-delà, `429` avec `Retry-After`.
- **Version** : `/api/v1`. Dans une version, aucun champ n’est retiré ni renommé ; de nouveaux champs peuvent s’ajouter.
- Réponses JSON, jamais mises en cache (`Cache-Control: no-store`). Erreurs : `{ "error": "…" }` avec `400`, `401`,
  `404` ou `429`. Instants en ISO 8601 UTC.

## 2. Lectures

| Requête | Réponse |
|---|---|
| `GET /api/v1/resources` | `{ facility, resources: [{ code, name, kind, status, capacity, granularity, setupMinutes, teardownMinutes, bufferMinutes, minNoticeHours, maxDays }] }` |
| `GET /api/v1/bookings?from=&to=&resource=` | `{ facility, from, to, bookings: [Booking] }` — réservations qui chevauchent la période, tous statuts, historique importé compris. `from`, `to` : jour `AAAA-MM-JJ` de Paris (de minuit à minuit, heure de Paris ; `to` inclus) ou instant ISO 8601 ; par défaut 7 jours avant à 30 jours après maintenant ; 186 jours au plus. `resource` : code d’un moyen de l’installation. |
| `GET /api/v1/bookings/<réf>` | `{ booking: Booking }` ou `404` |
| `GET /api/v1/events?after=<id>` | `{ facility, events: [Event], next }` — 100 événements au plus après `after` (0 par défaut), du plus ancien au plus récent ; rappeler avec `after=next` jusqu’à une liste vide. Pour un système qui ne peut pas recevoir de webhook. |

`Booking` : `ref`, `resource`, `facility`, `status` (`requested`, `confirmed`, `in_progress`, `done`, `cancelled`,
`no_show`), `start`, `end` (créneau réservé), `setupMinutes`, `teardownMinutes`, `actualStart`, `actualEnd`, `project`,
`keystoneProject`, `entity`, `purpose`, `operators`, `confidential`, `series` (réservation hebdomadaire, CR-078),
`updatedAt`.

## 3. Événements

Écrits par des déclencheurs de la base dans la transaction du changement (`drizzle/0022_api_events_triggers.sql`) : aucun
chemin d’écriture ne peut en oublier un ; gardés tels quels (ajout seul). L’historique importé n’en produit pas.

| `type` | Quand |
|---|---|
| `booking.requested`, `booking.confirmed` | réservation créée (demande, proposition acceptée, urgence) |
| `booking.confirmed`, `booking.in_progress`, `booking.done`, `booking.cancelled`, `booking.no_show` | changement de statut |
| `booking.moved` | créneau ou moyen changé (scénario accepté) ; vers un autre moyen : un événement sur l’ancien et un sur le nouveau |
| `incident.open`, `incident.closed` | aléa sur un moyen (panne) déclaré ou clos |

`Event` : `{ id, type, occurredAt, facility, resource, booking?, incident? }`. `booking` est la réservation **telle
qu’elle est au moment de l’envoi** (un événement signale un changement ; on ne rejoue pas un état ancien).
`incident` : `{ ref, kind, status, label, start, end }`.

## 4. Webhooks

Facultatifs : si le client a une adresse, Crucible lui envoie chaque événement de l’installation, **un `POST` par
événement, dans l’ordre, au moins une fois** (le destinataire ignore un `id` déjà reçu). La tâche `api-webhooks` tourne
chaque minute. Un nouveau client part du dernier événement (pas d’arriéré).

En-têtes : `X-Crucible-Event` (type), `X-Crucible-Delivery` (id), `X-Crucible-Timestamp` (secondes),
`X-Crucible-Signature: sha256=<hex>` = HMAC-SHA256, avec le secret de signature `crw_…`, de `"<timestamp>.<corps>"`.

- Une réponse **2xx** vaut remise ; toute autre (redirections comprises, non suivies), une erreur réseau ou plus de
  10 secondes arrêtent l’envoi du client : nouvel essai après 1, 2, 4… jusqu’à 60 minutes. Le dernier envoi et la dernière
  erreur s’affichent dans l’onglet.
- Le secret de signature doit être relu pour signer : il est donc gardé en base (jamais réaffiché). « Nouveau secret de
  signature » le remplace immédiatement.

Vérification (Python) :

```python
import hashlib, hmac, time

def verify(secret: str, headers, body: bytes) -> bool:
    ts = headers["X-Crucible-Timestamp"]
    if abs(time.time() - int(ts)) > 300:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, headers["X-Crucible-Signature"])
```

## 5. Exemple

```bash
curl -H "Authorization: Bearer cra_…" "https://crucible.epc2i.fr/api/v1/bookings?from=2026-11-02&to=2026-11-08&resource=PDE-LAB"
```
