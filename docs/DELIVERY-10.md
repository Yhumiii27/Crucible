# Livraison 10 — maintenance et étalonnage des moyens (CR-073)

> 1er nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « lance le prochain point du reste à
> faire », choix CR-073 (ajout de l’analyse comparative du 25 oct. 2026, approuvé par ce choix). Relecture du questionnaire
> avant la livraison : aucune nouvelle réponse. Nouvelle question **X-12** ([`DECISIONS.md`](DECISIONS.md) §10), réponse
> par défaut appliquée, à confirmer.

## 1. Plans de maintenance et d’étalonnage

Nouvel onglet **Maintenance et étalonnage** de la fiche d’installation (`/facilities/<code>?tab=maintenance`). Les contrôles
réglementaires restent ceux de l’onglet Contrôles périodiques (R-6, lus dans Vigie, D23) ; cet onglet porte ce que
l’installation entretient elle-même ou fait faire.

- **Plan** (coordinateur ou responsable de l’installation) : moyen, nature (maintenance préventive ou étalonnage),
  intervention, périodicité en mois, dernière intervention, prestataire, et s’il **bloque les réservations** une fois
  l’échéance dépassée (par défaut) ou n’est qu’une **alerte**. L’échéance (dernière intervention + périodicité) est
  calculée, jamais stockée.
- **Intervention** : date, prestataire, référence Codex du certificat ou du rapport, note. Gardée telle qu’enregistrée
  (table `maintenance_records`, **ajout seul** par déclencheurs) ; elle déplace la dernière date du plan quand elle est plus
  récente. Historique des 12 derniers mois sous le plan.
- **Retrait** d’un plan devenu inutile : il ne bloque ni n’alerte plus ; ses interventions restent.
- Chaque ajout, intervention et retrait est écrit au journal.

## 2. Blocage et alertes

- **Contrainte dure** (`checkBooking`, code `maintenance_due`) : un plan bloquant dont l’échéance tombe avant la fin d’un
  créneau le refuse, en citant l’intervention et la date — pour une demande, une confirmation, une proposition du moteur et un
  scénario de reprise. Le moteur classe un besoin ainsi bloqué comme « contrôle, maintenance ou étalonnage à faire d’abord ».
- **Alerte** : chaque jour (tâche `maintenance-reminders`), les coordinateurs et responsables de l’installation reçoivent une
  notification (cloche, et e-mail si le transport est réglé) pour chaque plan à échéance dans les **14 jours** ou dépassée,
  une seule fois par échéance. L’onglet affiche le nombre de plans à faire.

## 3. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **378 tests** sur PostgreSQL 16, dont 7 nouveaux : règles
  pures (échéance, état, saisie), contrainte `maintenance_due`, intégration (`src/features/maintenance/actions.test.ts` :
  droits, refus d’un créneau après l’échéance, intervention en ajout seul qui déplace l’échéance, plan d’alerte sans blocage,
  notification unique par échéance, retrait).
- Build de production et `npm run test:smoke` : un contrôle de plus (l’onglet Maintenance et étalonnage).
- Migrations `0016_maintenance` (générée) et `0017_maintenance_append_only` (déclencheurs). Les vues `pub_` ne changent pas.
