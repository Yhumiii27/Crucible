# Livraison 6 — assistant IA

> 23 oct. 2026, branche `claude/lucid-dirac-7bdq6x`. Spécification [`spec/04-assistant-ia.md`](spec/04-assistant-ia.md) et
> écran « Assistant » de [`spec/05-ecrans.md`](spec/05-ecrans.md). Réponses appliquées : I-1 à I-4 (confirmées le 22 oct. 2026).
> Relecture du questionnaire avant la livraison (23 oct. 2026) : aucune nouvelle réponse. Nouvelles questions I-5 et I-6
> ([`DECISIONS.md`](DECISIONS.md) §7), réponse par défaut appliquée, à confirmer.

## 1. Le principe tenu

L’assistant est un **panneau de conversation disponible sur chaque écran** (bouton « Assistant IA » de l’en-tête). Il
**s’appuie sur le moteur, jamais à sa place** : il lit le planning avec les droits de la personne qui l’interroge, explique
les résultats du moteur, simule et prépare. **Il n’écrit rien dans le planning** : un besoin qu’il prépare s’ouvre dans le
formulaire des besoins, un compte rendu d’arbitrage s’ouvre dans la décision du conflit ; la personne vérifie et enregistre,
avec ses droits, et la ligne du journal cite l’échange (« préparé avec l’assistant · AS-2026-0001 #3 »).

| Garde-fou (spec 04 §3) | Comment |
|---|---|
| Jamais de décision seule (I-2) | aucun outil d’écriture : les sept consultations de `src/server/assistant/facts.ts` lisent ; une simulation est construite puis abandonnée (aucun scénario enregistré) ; un besoin est vérifié comme le formulaire le vérifie, puis rendu en brouillon |
| Jamais de substitution inventée | « où faire cet essai » ne propose que le moyen nominal et les substitutions **validées** (R-4) |
| Jamais de règle de sécurité modifiée | aucun outil ne touche aux règles ; la consigne de Claude l’interdit aussi |
| Droits de l’utilisateur | chaque consultation filtre comme les écrans : installations visibles, projets masqués (U-3) ; un conflit ou un besoin hors du périmètre est « introuvable » |
| Traçabilité | chaque échange est conservé tel quel (tables `assistant_conversations`, `assistant_turns`, en ajout seul par déclencheurs) : la question, les consultations faites, ce qui est parti chez le fournisseur, la réponse ; l’écriture qu’il a préparée le cite au journal |
| Repli sans IA (I-3) | sans fournisseur validé, l’assistant répond par **gabarits** à partir des données de Crucible, et rien ne quitte Crucible |

## 2. Ce que l’assistant répond

| Usage (spec 04 §2) | Sans IA (gabarits, par défaut) | Avec Claude |
|---|---|---|
| Expliquer une proposition (« pourquoi le 14 et pas le 7 ? ») | trace du moteur : rang dans l’ordre de service, critères de priorité du besoin, créneau, et **pour chaque créneau antérieur la première contrainte qui le refuse** (réservation ou besoin servi avant qui le tient, règle d’exclusion, fermeture, compétence manquante, équipement occupé) | la même trace, rédigée |
| Expliquer un conflit et préparer l’arbitrage | fiche du conflit, options et conséquences, règle citée, **projet de compte rendu** ; « Décider avec ce compte rendu » ouvre la décision pré-remplie | idem, compte rendu rédigé par Claude |
| Simuler (« et si l’atelier était en panne mardi ? ») | moyen indisponible sur des jours : réservations déplacées, retards avant / après par projet ; rien n’est enregistré | idem |
| Trouver une alternative | premier créneau libre sur le moyen nominal et les substitutions validées, sur une fenêtre | idem |
| Anticiper | goulots du plan de charge sur un trimestre ou une période, besoins menacés, contrôles qui tombent dans la fenêtre d’un besoin | idem |
| Déclarer un besoin en langage naturel | non (renvoi au formulaire) : les gabarits ne lisent que des références, des codes et des dates | **brouillon de besoin vérifié** ; « Ouvrir le formulaire » le pré-remplit, la personne l’enregistre |
| Rédiger | compte rendu d’arbitrage | tout texte à partir des faits consultés |

Raccourcis : « Pourquoi ? » sur chaque proposition et chaque besoin non placé (`/propose`), « Expliquer » sur chaque fiche de
conflit (`/conflicts`). Sans IA, une question non reconnue reçoit des exemples construits sur ce que la personne voit
(références réelles), cliquables.

## 3. Claude (désactivé par défaut)

- **Activation** : `CRUCIBLE_AI=claude` **et** `ANTHROPIC_API_KEY` (la clé est passée explicitement : aucune autre clé de la
  machine n’active l’assistant). À poser **seulement après la validation de la DSI** (fournisseur et région d’hébergement,
  I-3). `CRUCIBLE_AI_MODEL` (défaut `claude-opus-5-5`), `CRUCIBLE_AI_FALLBACKS=off` pour un modèle sans repli (`.env.example`,
  `src/server/config/parse.ts`). Le panneau dit toujours qui répond et ce qui part chez Anthropic.
- **Fonctionnement** (`src/server/assistant/claude.ts`) : boucle d’appels non diffusés avec sept outils aux schémas stricts,
  effort `medium`, consigne système mise en cache, repli côté serveur en cas de refus (`fallbacks: "default"`), au plus huit
  allers-retours par question. Les messages de chaque tour sont conservés et renvoyés **à l’identique** aux tours suivants
  (historique en ajout seul, comme l’exige l’API). Un échec (clé refusée, limite de débit, refus, réponse tronquée…) n’empêche
  pas de répondre : les gabarits répondent, avec la raison.
- **Données envoyées (I-4)** : la question, la date, le profil et l’écran ouvert, puis seulement ce que les outils renvoient
  pour cette question ; un **projet confidentiel** n’est jamais nommé (« Projet confidentiel »), et un besoin d’un projet
  confidentiel n’est pas expliqué au fournisseur ; aucune donnée personnelle hormis les noms des personnes planifiées (qui a
  décidé un arbitrage est donné par son profil).

## 4. Le moteur explique sa trace

`traceNeed` (`src/domain/engine.ts`) rejoue le moteur jusqu’au besoin et, pour chaque moyen essayé (nominal, puis
substitutions validées), dit pourquoi chaque créneau antérieur a été refusé, regroupé en périodes. Même entrée, même réponse ;
quand le planning a changé depuis le dernier passage du moteur, l’explication le signale et porte sur l’état actuel.

## 5. Vérifications

- `npm run typecheck`, `npm run lint` : sans erreur. `npm test` : **315 tests** sur PostgreSQL 16, dont la trace du moteur
  (règle d’exclusion et réservation qui tient le créneau, besoin servi avant, compétence manquante), la lecture des questions
  sans IA, la configuration, et **9 tests d’intégration** : explication et masque U-3, conversation et périmètre, simulation
  sans écriture, compte rendu repris dans la décision et cité au journal, ajout seul ; avec un client Claude simulé (aucun
  appel réseau) : rien de confidentiel n’est envoyé, la requête (outils stricts, effort, repli), le brouillon de besoin
  enregistré par la personne et cité au journal, l’historique renvoyé à l’identique, les échecs et refus remplacés par les
  gabarits, un outil inventé refusé, les codes du périmètre de la personne seulement.
- Build de production, `npm run test:smoke` : **54 contrôles HTTP** (bouton de l’assistant, « Pourquoi ? », « Expliquer »,
  pas d’assistant pour l’administrateur).
- Navigateur (build de production) : « Pourquoi ? » sur une proposition, exemples cliquables, explication d’un conflit puis
  décision pré-remplie avec le compte rendu, question en anglais.
- Correctif au passage : l’ordre des besoins d’un conflit dans « À trancher » dépendait des identifiants aléatoires (test
  instable) ; il suit désormais les références.

## 6. Limites

- Claude reste **désactivé** tant que la DSI n’a pas validé le fournisseur et la région (I-3) ; l’assistant n’a été essayé
  qu’avec un client simulé. Une région UE (Bedrock, Vertex) demanderait un autre client du SDK (réponse alternative d’I-3).
- La simulation porte sur un moyen indisponible sur des jours ; un changement d’horaires (« le PDE en 2 × 8 ») n’est pas encore
  simulable.
- Sans IA, un besoin écrit en langage courant n’est pas lu : la personne passe par le formulaire.
