-- Custom SQL migration file, put your code below! --
-- Share view of the weekly utilisation (S-5, X-4; Matrix partage/80-crucible.sql, readers: Matrix and the R&D direction's
-- dashboards). Read from the weekly snapshots, computed once each week is over and never recomputed. A pub_ view is a contract:
-- a column is never removed nor renamed (a change goes to a _v2 view), new columns go at the end. Rates are in % of the net
-- open hours (P-5), null without open hours.
CREATE OR REPLACE VIEW "crucible"."pub_occupation_hebdo" WITH (security_barrier) AS
SELECT s.monday                AS semaine,
       r.code                  AS moyen_code,
       r.facility_code         AS installation_code,
       s.net_open_hours        AS heures_ouvertes_nettes,
       s.booked_hours          AS heures_reservees,
       s.realised_hours        AS heures_realisees,
       s.realised_with_prep_hours AS heures_realisees_preparation,
       s.blocked_hours         AS heures_bloquees,
       s.no_shows              AS reservations_non_tenues,
       CASE WHEN s.net_open_hours > 0 THEN round((100 * s.realised_with_prep_hours / s.net_open_hours)::numeric, 1) END AS taux_realise_pct,
       s.computed_at           AS maj_le
FROM "crucible"."weekly_snapshots" s
JOIN "crucible"."resources" r ON r.id = s.resource_id;
--> statement-breakpoint
COMMENT ON VIEW "crucible"."pub_occupation_hebdo" IS 'Contrat v1 : occupation hebdomadaire par moyen (instantanés X-4). Lecteurs : matrix_app.';
