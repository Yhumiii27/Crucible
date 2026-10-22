-- Custom SQL migration file, put your code below! --
-- The audit trail is append-only (copied from Keystone's 0017_audit_append_only, R-168): a row trigger refuses UPDATE and
-- DELETE (a cascaded foreign-key action included) and a statement trigger refuses TRUNCATE. Tamper evidence, not tamper proof:
-- the table owner can still disable the triggers; real immutability needs a separate owner role and REVOKE (Matrix).
CREATE OR REPLACE FUNCTION "crucible"."audit_entries_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries is append-only: % refused', TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'The audit trail can only be added to.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_entries_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."audit_entries"
FOR EACH ROW EXECUTE FUNCTION "crucible"."audit_entries_append_only"();
--> statement-breakpoint
CREATE TRIGGER "audit_entries_no_truncate" BEFORE TRUNCATE ON "crucible"."audit_entries"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."audit_entries_append_only"();
