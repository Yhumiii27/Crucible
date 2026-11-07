# Livraison 22 — Suspensions d’essais lues dans Vigie (CR-060, V-2)

> 7 nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « continue », suite de CR-060 après la
> fusion de la demande M-21 chez Matrix (Yhumiii27/Matrix#73). Relecture du questionnaire avant la livraison : aucune
> nouvelle réponse. Nouvelle question **X-24** ([`DECISIONS.md`](DECISIONS.md) §10), réponse par défaut appliquée, à
> confirmer.

## 1. Ce qui attend la publication

Matrix a accepté de définir la publication `vigie.pub_suspensions_essais` (M-21 : `activite_id`, `site_code`, `zone_id`,
`zone_nom`, `zone_type`, `du`, `au`, `plage_horaire`, `entreprise`, `motif`, `maj_le`) ; elle n’existe pas encore. La lecture
est prête : tant que la vue n’est pas créée et accordée à `crucible_app`, l’écran Connecteurs affiche « Suspensions d’essais
Vigie · pas encore lisible » et rien n’est lu. Elle s’active seule, à la lecture suivante, sans nouvelle livraison.

## 2. Zones Vigie des moyens

- Les zones du plan de site de Vigie ne portent pas les codes des moyens de Crucible : le **responsable de l’installation**
  (ou le coordinateur) dit dans quelles zones Vigie se trouve chaque moyen — onglet **Calendrier et indisponibilités**,
  panneau « Zones Vigie » (numéros séparés par des virgules ; vide : aucune zone). Quand la vue est lisible, les zones
  publiées par Vigie sont rappelées avec leur nom. Journalisé.
- Table `vigie_zone_resources` (`drizzle/0031_vigie_suspensions.sql`), et `unavailabilities.source_ref`
  (`suspension:<activite_id>`).

## 3. Lecture (toutes les heures, et « Lire maintenant »)

- Chaque suspension d’une zone rattachée rend chacun de ses moyens **indisponible** : type « travaux », journées entières du
  premier au dernier jour (heure de Paris) ; le libellé reprend ce que dit Vigie, tel que saisi (« Vigie · entreprise · motif
  · plage horaire »). Une suspension déjà terminée n’est pas ajoutée. Règles pures : `src/domain/vigie-suspensions.ts`
  (`suspensionPlan`).
- L’indisponibilité **suit Vigie** : dates ou texte changés, elle change ; retirée de la vue, elle disparaît — sauf si elle est
  déjà passée (l’historique reste). Elle ne se retire pas dans Crucible (« Cette indisponibilité vient de Vigie : l’intervention
  se modifie dans Vigie ») ; elle porte la marque « Vigie ».
- Comme toute indisponibilité, elle bloque les nouvelles réservations (contrainte dure de `checkBooking`). Les réservations
  demandées ou confirmées qu’elle couvre **ne bougent pas** : les responsables et coordinateurs de l’installation reçoivent
  la notification « Travaux extérieurs sur un moyen réservé » (avec la réservation : l’e-mail porte l’invitation), à l’ajout
  ou au changement de la suspension. Le replanning reste une décision (scénario de reprise de la livraison 5).
- Chaque lecture qui change quelque chose est journalisée (zone « Installations », `vigie.pub_suspensions_essais`).

## 4. Ce qui n’est pas fait

- Bloquer seulement la plage horaire de Vigie (variante de X-24) : le texte libre `plage_horaire` n’a pas de format garanti.
- Proposer d’office un scénario de reprise (variante de X-24) : il reste déclenché par une personne.

## 5. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **455 tests** sur PostgreSQL 16, dont 9 nouveaux :
  `src/domain/vigie-suspensions.test.ts` (libellé, plan : ajout, zone inconnue, suspension passée ou mal datée, changement,
  retrait, doublon ; numéros de zones) et `src/server/integrations/vigie-suspensions.test.ts` (zones d’un moyen par le
  responsable de son installation seulement, vue non publiée, indisponibilité et notification sans déplacement, deuxième
  lecture sans effet, refus du retrait, suivi d’une modification puis d’un retrait dans Vigie).
- Migration `0031_vigie_suspensions` (générée).
