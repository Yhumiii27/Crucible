-- Custom SQL migration file, put your code below! --
-- Arbitrations are never changed (spec 02 §5, A-4): a new decision replaces the previous one. Same triggers as the audit trail
-- (0001_audit_append_only): UPDATE and DELETE refused row by row, TRUNCATE refused.
CREATE OR REPLACE FUNCTION "crucible"."arbitrations_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'arbitrations is append-only: % refused', TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'A new decision replaces the previous one.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "arbitrations_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."arbitrations"
FOR EACH ROW EXECUTE FUNCTION "crucible"."arbitrations_append_only"();
--> statement-breakpoint
CREATE TRIGGER "arbitrations_no_truncate" BEFORE TRUNCATE ON "crucible"."arbitrations"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."arbitrations_append_only"();
