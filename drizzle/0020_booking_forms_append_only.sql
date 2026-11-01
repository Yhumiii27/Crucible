-- Custom SQL migration file, put your code below! --
-- The forms filled for a booking are never changed (CR-075, X-14): a safety checklist, a test sheet or an incident report stays
-- as filled. Same triggers as the audit trail (0001_audit_append_only): UPDATE and DELETE refused row by row, TRUNCATE refused.
CREATE OR REPLACE FUNCTION "crucible"."form_responses_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'A form is kept as filled.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "form_responses_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."form_responses"
FOR EACH ROW EXECUTE FUNCTION "crucible"."form_responses_append_only"();
--> statement-breakpoint
CREATE TRIGGER "form_responses_no_truncate" BEFORE TRUNCATE ON "crucible"."form_responses"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."form_responses_append_only"();
