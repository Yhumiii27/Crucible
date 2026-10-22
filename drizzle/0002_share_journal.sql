-- Custom SQL migration file, put your code below! --
-- Share view of the EPC2I data sharing convention (Matrix: infra/postgres/partage/80-crucible.sql, proposed in
-- docs/DEMANDES-MATRIX.md M-4; journal contract D18, partage/95-matrix-journal-unifie.sql). A pub_ view is a contract: a column
-- is never removed nor renamed (a change goes to pub_journal_v2), new columns go at the end. Readers' grants: Matrix
-- (partage/90-droits.sql). `projet` carries the Crucible project code; `qui_matricule` stays null until Crucible knows
-- matricules (Cursus, S-3).
CREATE OR REPLACE VIEW "crucible"."pub_journal" WITH (security_barrier) AS
SELECT 'audit_entries:' || a.id::text AS ref_source,
       'audit'::text            AS nature,
       a.occurred_at            AS quand,
       a.actor_name             AS qui,
       a.actor_user_id::text    AS qui_ref,
       a.actor_role             AS qui_role,
       a.area                   AS action,
       a.object_ref             AS objet,
       a.change                 AS detail,
       a.project_code           AS projet,
       NULL::text               AS qui_matricule
FROM "crucible"."audit_entries" a
UNION ALL
SELECT 'activity_events:' || e.id::text, 'activite', e.occurred_at, e.actor_name, e.actor_user_id::text, NULL,
       'activity.' || e.kind, NULL, e.text, e.project_code, NULL::text
FROM "crucible"."activity_events" e;
--> statement-breakpoint
COMMENT ON VIEW "crucible"."pub_journal" IS 'Contrat D18 v1 : piste d''audit et fil d''activité de Crucible aux colonnes communes. Lecteur : matrix_app (matrix.journal_unifie).';
