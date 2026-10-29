# Livraison 7 — occupation mesurée et agendas Outlook / Teams

> 29 oct. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « lance CR-071 et CR-072 », les deux
> points « prochaine étape » de l’analyse comparative du 25 oct. 2026 (`docs/reste-a-developper.json`). Relecture du
> questionnaire avant la livraison : aucune nouvelle réponse. Nouvelles questions **X-8** et **X-9**
> ([`DECISIONS.md`](DECISIONS.md) §10), réponse par défaut appliquée, à confirmer.

## 1. CR-071 — l’occupation réelle mesurée sans déclaration (X-8)

Jusqu’ici, un essai n’était « démarré » et « terminé » que si un technicien le faisait dans Mon planning. Crucible accepte
maintenant des **appareils** qui le disent pour lui :

| Appareil | Comment il parle à Crucible |
|---|---|
| **Borne** (tablette à l’entrée du moyen) | page `/kiosk/<jeton>` : le moyen, l’essai en cours, les suivants de la journée, deux grands boutons **Démarrer** / **Arrêter** ; relue chaque minute |
| **Agent sur le PC du banc**, **verrouillage (interlock)**, **lecteur de badge** | `POST /api/occupancy`, `Authorization: Bearer <jeton>`, `{"event": "start" \| "stop", "at"?: instant ISO 8601}` |

- **Gestion** : onglet **Mesure de l’occupation** de la fiche d’installation. Le responsable d’installation (ou le coordinateur)
  ajoute un appareil à un moyen de son installation ; le jeton et l’adresse de la borne ne sont affichés **qu’une fois** et ne
  sont gardés qu’en empreinte SHA-256 ; il le révoque d’un clic. Ajout et révocation sont tracés au journal.
- **Rapprochement** (règles pures, `src/domain/occupancy.ts`) :
  - un **début** démarre la réservation **confirmée** du moyen dont le créneau contient l’instant — préparation et
    **30 minutes de tolérance** comprises ; l’heure réelle de début est celle de l’événement ;
  - une **fin** termine l’essai en cours (heure réelle de fin = celle de l’événement) ;
  - sans réservation, le début ouvre une **utilisation sans réservation** et la fin la ferme : elles sont listées sur la fiche
    (30 derniers jours) et **ne comptent pas dans l’occupation** — on réserve le créneau, ou on le demande aux utilisateurs ;
  - un début pendant un essai en cours, une fin sans rien en cours, une fin avant le début réel : **ignorés**, avec la raison.
- **Ce qui reste humain** : libérer une réservation non tenue (A-7) reste la décision du responsable ; Crucible n’annule rien
  de lui-même.
- **Traçabilité** : chaque événement est gardé tel que reçu (table `occupancy_events`, **ajout seul** par déclencheurs) ; le
  démarrage ou la fin d’une réservation est écrit au journal au nom de l’appareil (« Borne labo (kiosk) »).
- **Confidentialité** : la borne est vue par tous ceux qui passent devant le moyen ; un projet confidentiel n’y est jamais
  nommé (U-3), seule la référence de la réservation s’affiche.

## 2. CR-072 — e-mail réel et agendas Outlook / Teams (X-9)

- **Envoi des e-mails** (`src/server/notify/mail.ts`) : en plus de `none` et `file`, deux transports réels :
  - `smtp` : le relais du groupe (`CRUCIBLE_SMTP_URL`) ;
  - `graph` : Microsoft Graph `sendMail` depuis la boîte `CRUCIBLE_MAIL_FROM`, le message MIME tel quel (application Entra avec la
    permission d’application `Mail.Send`, à limiter à la boîte d’envoi par la DSI).

  Le message est composé une fois (nodemailer), en français. Une notification n’est marquée envoyée qu’une fois acceptée ; un
  échec est journalisé et repris au passage suivant ; trois échecs de suite arrêtent le passage.
- **Invitations** : une notification sur une réservation **confirmée, déplacée ou annulée** porte son invitation d’agenda
  (`text/calendar`, `METHOD:REQUEST`, puis `CANCEL` à l’annulation) : même identifiant (UID) et numéro de version croissant,
  pour qu’Outlook — donc Teams — ajoute, mette à jour ou retire l’essai.
- **Abonnements** : page **Notifications**, « S’abonner depuis Outlook » : **mes essais** (ceux que j’ai demandés, et ceux des
  installations où je travaille) ou **un moyen** que je vois. L’adresse `/api/calendar/<jeton>.ics` n’est affichée qu’une fois,
  gardée en empreinte, révocable ; Outlook la relit toutes les heures, **avec les droits de la personne au moment de la
  lecture** (un projet qu’elle ne voit pas reste « Réservé (confidentiel) » ou « Réservé · <entité> »). Fenêtre : 30 jours en
  arrière, 6 mois en avant ; demandes en « provisoire », réservations confirmées en « confirmé ».
- **Configuration** : `CRUCIBLE_PUBLIC_URL` (liens), `CRUCIBLE_MAIL_TRANSPORT`, `CRUCIBLE_MAIL_FROM`, `CRUCIBLE_SMTP_URL`,
  `CRUCIBLE_GRAPH_CLIENT_ID` / `_SECRET` (`.env.example`, kits Coolify, [`EXPLOITATION.md`](EXPLOITATION.md) §5).

## 3. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **349 tests** sur PostgreSQL 16, dont :
  - règles de l’occupation (fenêtre de tolérance, essai en cours, utilisation sans réservation, instant d’un événement) et de
    l’iCalendar (échappement, repli des lignes à 75 octets sans couper un caractère, invitation, annulation, abonnement) ;
  - intégration : appareil ajouté par le responsable seulement (jeton jamais stocké en clair, journal), API (401 sans jeton,
    400 corps invalide, démarrage dans la fenêtre de préparation, fin datée, utilisation sans réservation), borne (projet
    confidentiel jamais nommé), révocation, événements en ajout seul ;
  - abonnements : technicien (projet confidentiel masqué), partenaire (moyen vu seulement, projet d’une autre entité masqué),
    révocation par son seul propriétaire, 404 sur adresse inconnue ; invitations REQUEST puis CANCEL avec le même UID ;
    transport SMTP (message et enveloppe remis au relais) et Graph (jeton par identifiants client, `sendMail` du message MIME,
    reprise après un refus) ; configuration des transports.
- Build de production et `npm run test:smoke` : **63 contrôles HTTP** (onglet Mesure de l’occupation selon le profil, 401 sur
  l’API sans jeton, 404 sur une borne ou un abonnement inconnus, section des agendas de la page Notifications).
- Essai de bout en bout sur le build de production : un agent envoie un « début » (utilisation sans réservation), la borne
  l’affiche et l’arrête, un abonnement Outlook renvoie le calendrier du technicien ; rendu vérifié dans le navigateur (fiche,
  borne sur tablette, page Notifications).

## 4. Limites

- **Matériel** : Crucible fournit la borne et l’API ; le branchement d’un verrouillage ou d’un lecteur de badge (petit
  programme qui appelle l’API) dépend du matériel des installations, à voir avec les responsables (données D-1).
- **Bêta derrière l’authentification HTTP** : tant que le domaine est protégé par l’authentification HTTP de Coolify, un
  capteur doit aussi la fournir et Outlook ne peut pas lire un abonnement ; tout fonctionne une fois Entra en place.
- **Activation des e-mails** : le relais SMTP ou l’application Graph sont à demander à la DSI ; sans eux, `none` reste la
  valeur (la cloche seulement).
- **Hors lot** : `npm audit` signale une faille de `zod` (< 4.6.6, épuisement mémoire sur de très grandes collections), déjà
  présente avant cette livraison ; à mettre à jour dans un lot à part.
