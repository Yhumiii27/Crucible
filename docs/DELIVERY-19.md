# Livraison 19 — téléphone et hors ligne (CR-082)

> 2 nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : « fait les prochains points ». Relecture
> du questionnaire avant la livraison : aucune nouvelle réponse. Nouvelle question **X-21** ([`DECISIONS.md`](DECISIONS.md)
> §10), réponse par défaut appliquée, à confirmer.

## 1. Recette sur téléphone

Recette sur un écran de téléphone (Pixel 7, 412 px ; iPhone 13, 390 px) : Mon planning, la cloche et les pages se lisent sans
défilement horizontal. **Défaut trouvé et corrigé** : jusqu’à 1024 px le menu latéral était masqué sans bouton pour l’ouvrir
(les styles du tiroir venaient de Keystone, le bouton manquait). Une **barre supérieure** porte désormais le bouton
« Menu » ; le menu s’ouvre en tiroir et se ferme par sa croix, le fond, Échap ou un lien suivi
(`src/components/app/shell/mobile-menu.tsx`).

## 2. Application installable

Manifeste (`src/app/manifest.ts`) : Crucible s’installe sur l’écran d’accueil (HTTPS requis en production) et s’ouvre sur
**Mon planning**, en plein écran.

## 3. Hors ligne

- **Service worker** (`/sw.js`, `src/app/sw.js/route.ts`) : Mon planning est lu sur le réseau d’abord et sa dernière copie
  gardée ; les fichiers de l’application sont gardés une fois chargés ; toute autre page sans réseau affiche un court avis.
  Aucune écriture n’est interceptée ; la copie est effacée à la déconnexion.
- **Démarrer / Terminer sans réseau** : l’action est gardée sur le téléphone avec l’instant pressé (« 1 enregistrement(s) hors
  ligne, en attente du réseau ») puis envoyée au retour du réseau (`src/features/offline/`). Le serveur
  (`syncOfflineEventsAction`) l’applique **à l’instant enregistré**, dans l’ordre, avec tous les contrôles de l’écran (droits,
  transition, check-list sécurité, consommables pris à la fin) ; il refuse un enregistrement de plus de 48 heures ou daté dans
  le futur. Chaque refus s’affiche ; le journal indique « recorded offline ». Les heures saisies à la main de « Terminer » se
  saisissent au retour du réseau.

## 4. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **438 tests** sur PostgreSQL 16, dont 2 nouveaux
  (`src/features/offline/sync.test.ts` : refus un par un, application à l’instant enregistré, envoi en double refusé).
- Nouveau parcours Playwright sur téléphone (`tests/e2e/mobile.spec.ts`) : sans défilement horizontal, tiroir du menu, puis
  réseau coupé — Mon planning affiché par le service worker, démarrage gardé puis envoyé au retour du réseau. Les 5 parcours
  passent.
- Pas de migration.
