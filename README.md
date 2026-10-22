# Crucible

Application du groupe pour **planifier et arbitrer l’usage des moyens d’essais partagés** de la R&D : laboratoire 67
(partagé avec EPC France), PDE, laboratoire PDE, atelier mécanique. Anticipation des besoins à partir des échéances des
projets, proposition de créneaux sous contraintes (sécurité, exclusions entre installations, personnes habilitées),
arbitrage des conflits selon des règles explicites, substitutions validées, replanification après aléa, mesure de
l’occupation réelle, assistant IA.

**État : livraisons 1 (socle) et 2 (moyens, règles, réservations, occupation) faites** — [`docs/DELIVERY-1.md`](docs/DELIVERY-1.md), [`docs/DELIVERY-2.md`](docs/DELIVERY-2.md). Analyse : [`docs/ANALYSE.md`](docs/ANALYSE.md) · spécification :
[`docs/spec/00-vue-ensemble.md`](docs/spec/00-vue-ensemble.md) · questions ouvertes : [`docs/DECISIONS.md`](docs/DECISIONS.md) ·
plan : [`docs/PLAN.md`](docs/PLAN.md) · atelier avec les équipes : [`docs/ATELIER-CADRAGE.md`](docs/ATELIER-CADRAGE.md).

```bash
npm ci
npm run db:local        # PostgreSQL : base epc2i, rôle crucible_app, schéma crucible
cp .env.example .env.local
npm run db:migrate      # migrations et jeu de démonstration
npm run dev             # http://localhost:3500
npm run questionnaire:page   # questionnaire « Décisions Crucible » (.artifacts/)
npm run remaining:page       # page « reste à développer »
```

Exploitation : [`docs/EXPLOITATION.md`](docs/EXPLOITATION.md).
