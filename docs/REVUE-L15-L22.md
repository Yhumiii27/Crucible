# Revue de qualité des livraisons 15 à 22

> 9 nov. 2026, branche `claude/lucid-dirac-7bdq6x`. Demande du responsable produit : revue de qualité du code des livraisons
> 15 à 22 (`e80f542..bcde250`), corrections livrées dans une PR. Aucun changement de périmètre ni nouvelle question.

| # | Constat | Correction |
|---|---|---|
| 1 | **Téléphones (L19)** — la copie de « Mon planning » gardée par le service worker n’était pas effacée à la déconnexion : la déconnexion est un `POST`, écarté avant le contrôle. | `/sw.js` reconnaît la déconnexion avant d’écarter les requêtes autres que `GET` ; test `src/app/sw.js/route.test.ts`. |
| 2 | **Téléphones (L19)** — un démarrage ou une fin enregistrés hors ligne restaient sur le téléphone après la déconnexion et partaient avec la session suivante (journal au nom d’une autre personne). | Chaque enregistrement porte le compte qui l’a fait ; seul ce compte l’envoie, et le serveur refuse celui d’un autre compte (« Enregistré hors ligne par un autre compte »). |
| 3 | **Consommables (L18)** — la prévision comptait deux fois un lot qui périme : retiré comme périmé alors qu’une réservation antérieure l’aurait déjà utilisé. | `shortages` rejoue chaque réservation à venir comme sa fin le ferait (`pickLots`, lots non périmés à sa date, le plus tôt périmé d’abord), puis le stock sans lot. |
| 4 | **Consommables (L18)** — une réservation passée jamais clôturée comptait encore comme besoin à venir. | Seules les réservations demandées ou confirmées qui ne sont pas terminées comptent. |
| 5 | **Consommables (L18)** — le jour d’une réservation était pris en UTC. | Jour de Paris (`parisParts`), réservations triées par début. |
| 6 | **Consommables (L18)** — une sortie (mise au rebut, ajustement négatif) sans lot laissait les lots et leurs alertes faux. | Une sortie se fait d’un lot quand il en reste en lots, et pas plus que le lot n’en contient. |
| 7 | **API (L15)** — un jour `AAAA-MM-JJ` de `from` / `to` était pris de minuit à minuit UTC. | Jour de Paris, comme partout dans Crucible (`docs/API.md`). |
| 8 | **Vigie (L22)** — une suspension dont seul le texte change signalait à nouveau les réservations couvertes. | Seules une suspension ajoutée ou dont les jours changent signalent les réservations. |

Vérifications : `npm run typecheck`, `npm run lint` sans erreur ; `npm test` : 458 tests sur PostgreSQL 16 (tests ajoutés ou
complétés pour chaque correction).
