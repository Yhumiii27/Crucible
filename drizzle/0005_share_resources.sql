-- Custom SQL migration file, put your code below! --
-- Share views of the test resources and their bookings (S-5, S-7, R-7; Matrix partage/80-crucible.sql, readers' grants
-- already in partage/90-droits.sql: keystone_app, vigie_app, matrix_app). A pub_ view is a contract: a column is never removed
-- nor renamed (a change goes to a _v2 view), new columns go at the end.
-- pub_reservations holds the bookings that hold a resource (confirmed, started, done): Keystone shows the tests of its projects
-- (projet_keystone), Vigie detects co-activity (an entity's test in a shared facility, R-7). What a test is for stays inside
-- Crucible for a confidential project (U-3): project, Keystone project and purpose are null, `confidentiel` is true.
CREATE OR REPLACE VIEW "crucible"."pub_moyens" WITH (security_barrier) AS
SELECT r.code                  AS code,
       r.name                  AS nom,
       r.kind                  AS nature,
       r.facility_code         AS installation_code,
       f.name                  AS installation,
       f.site_code             AS site_code,
       f.operator_entity_code  AS entite_exploitante,
       r.capacity              AS capacite,
       r.granularity           AS granularite,
       r.status                AS etat,
       r.updated_at            AS maj_le
FROM "crucible"."resources" r
JOIN "crucible"."facilities" f ON f.code = r.facility_code;
--> statement-breakpoint
COMMENT ON VIEW "crucible"."pub_moyens" IS 'Contrat v1 : moyens d''essai de Crucible (installation, site, entité exploitante, état). Lecteurs : keystone_app, vigie_app, matrix_app.';
--> statement-breakpoint
CREATE OR REPLACE VIEW "crucible"."pub_reservations" WITH (security_barrier) AS
SELECT b.ref                   AS ref,
       r.code                  AS moyen_code,
       r.facility_code         AS installation_code,
       f.site_code             AS site_code,
       b.entity_code           AS entite_code,
       CASE WHEN p.confidential THEN NULL ELSE b.project_code END AS projet_code,
       CASE WHEN p.confidential THEN NULL ELSE p.keystone_code END AS projet_keystone,
       CASE WHEN p.confidential THEN NULL ELSE b.title END        AS objet,
       p.confidential          AS confidentiel,
       b.status                AS statut,
       b.starts_at             AS debut,
       b.ends_at               AS fin,
       b.actual_start_at       AS debut_reel,
       b.actual_end_at         AS fin_reel,
       b.updated_at            AS maj_le
FROM "crucible"."bookings" b
JOIN "crucible"."resources" r ON r.id = b.resource_id
JOIN "crucible"."facilities" f ON f.code = r.facility_code
JOIN "crucible"."projects" p ON p.code = b.project_code
WHERE b.status IN ('confirmed', 'in_progress', 'done');
--> statement-breakpoint
COMMENT ON VIEW "crucible"."pub_reservations" IS 'Contrat v1 : réservations qui tiennent un moyen (confirmées, en cours, terminées) ; projet et objet masqués pour un projet confidentiel. Lecteurs : keystone_app, vigie_app, matrix_app.';
