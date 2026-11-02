-- Custom SQL migration file, put your code below! ---- The results of a test are kept as recorded (CR-081, X-18): a correction is a new version with its reason. Same triggers as the
-- audit trail (0001_audit_append_only): UPDATE and DELETE refused row by row, TRUNCATE refused.
CREATE OR REPLACE FUNCTION "crucible"."test_results_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'A result is corrected by a new version.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "test_results_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."test_results"
FOR EACH ROW EXECUTE FUNCTION "crucible"."test_results_append_only"();
--> statement-breakpoint
CREATE TRIGGER "test_results_no_truncate" BEFORE TRUNCATE ON "crucible"."test_results"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."test_results_append_only"();
