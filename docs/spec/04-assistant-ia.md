# 04 — Assistant IA

> Proposition (livraison 0). I-1 à I-4 confirmés le 22 oct. 2026 ; **livré en L6** ([`../DELIVERY-6.md`](../DELIVERY-6.md)), avec
> les questions I-5 et I-6 de [`../DECISIONS.md`](../DECISIONS.md).

## 1. Principe : un agent qui s’appuie sur le moteur, jamais à sa place

L’« agent IA » demandé est un **assistant conversationnel** qui utilise les fonctions de Crucible comme des **outils** :
il lit le planning, appelle le moteur déterministe (spec 03), compare des scénarios et rédige. Il ne contourne aucune
contrainte : chaque proposition qu’il présente vient du moteur, qui garantit les contraintes dures. Toute écriture
(réservation, arbitrage, règle) est **préparée** par l’assistant et **validée** par une personne dans l’écran habituel,
avec ses droits.

## 2. Ce que l’assistant fait

| Usage | Exemple | Outils appelés |
|---|---|---|
| Déclarer un besoin en langage naturel | « J’ai 6 tirs de qualification à faire avant le jalon J3 du projet Orion, au PDE de préférence » | lecture des projets, types d’essai ; prépare une demande à valider |
| Expliquer une proposition | « Pourquoi mon essai est-il proposé le 14 et pas le 7 ? » | trace du moteur : exclusion avec l’atelier le 7, opérateur absent |
| Expliquer un conflit et préparer l’arbitrage | « Résume le conflit du laboratoire 67 de la semaine 46 pour le comité » | fiche de conflit, conséquences, règle appliquée |
| Simuler | « Et si le PDE passait en 2 × 8 en novembre ? » « Et si l’atelier était fermé le mardi ? » | moteur en mode scénario |
| Trouver une alternative | « Où puis-je faire cet essai de traction cette semaine ? » | substitutions **validées** seulement |
| Anticiper | « Quels projets risquent de manquer de PDE au premier trimestre ? » | charge prévisionnelle |
| Rédiger | compte rendu d’arbitrage, message aux demandeurs touchés par un aléa | — |

## 3. Garde-fous

- **Jamais de décision seule** : l’assistant n’a aucun droit d’écriture propre ; il prépare, la personne valide.
- **Jamais de substitution inventée** : il ne propose que des substitutions validées (spec 02 §1).
- **Jamais de règle de sécurité modifiée** : les règles d’exclusion ne sont modifiables que par le référent sécurité.
- **Droits de l’utilisateur** : l’assistant voit ce que voit l’utilisateur qui l’interroge, pas plus (même filtre de
  visibilité).
- **Traçabilité** : chaque échange qui aboutit à une écriture est référencé dans la piste d’audit.
- **Repli sans IA** : sans fournisseur validé, Crucible fonctionne entièrement (moteur, explications par gabarits à
  règles), comme l’analyse de réunions de Keystone sans `ANTHROPIC_API_KEY`.

## 4. Technique (proposition)

- API Claude d’Anthropic (modèle le plus récent disponible), utilisation d’outils (*tool use*) : les outils sont des
  fonctions serveur de Crucible, avec validation et contrôle des droits comme toute Server Function.
- Activé seulement si `CRUCIBLE_AI=claude` et une clé sont présents, et après validation du fournisseur (hébergement
  des données, I-3) ; désactivé par défaut.
- Données envoyées : le strict nécessaire à la question (pas d’export du référentiel entier) ; projets confidentiels
  exclus (I-4).
- Livraison L6, après que le moteur a fait ses preuves (PLAN).
