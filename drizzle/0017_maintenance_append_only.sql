-- Custom SQL migration file, put your code below! --
-- The interventions recorded on a maintenance or calibration plan are never changed (CR-073, X-12): what was done, when and
-- by whom stays as recorded. Same triggers as the audit trail (0001_audit_append_only): UPDATE and DELETE refused row by row,
-- TRUNCATE refused.
CREATE OR REPLACE FUNCTION "crucible"."maintenance_records_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'An intervention is kept as recorded.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "maintenance_records_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."maintenance_records"
FOR EACH ROW EXECUTE FUNCTION "crucible"."maintenance_records_append_only"();
--> statement-breakpoint
CREATE TRIGGER "maintenance_records_no_truncate" BEFORE TRUNCATE ON "crucible"."maintenance_records"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."maintenance_records_append_only"();
