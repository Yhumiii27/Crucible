-- Custom SQL migration file, put your code below! --
-- The assistant's conversations and turns are never changed (spec 04 §3, traceability): same triggers as the audit trail
-- (0001_audit_append_only). UPDATE and DELETE refused row by row, TRUNCATE refused.
CREATE OR REPLACE FUNCTION "crucible"."assistant_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'A new turn follows the previous ones.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "assistant_conversations_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."assistant_conversations"
FOR EACH ROW EXECUTE FUNCTION "crucible"."assistant_append_only"();
--> statement-breakpoint
CREATE TRIGGER "assistant_conversations_no_truncate" BEFORE TRUNCATE ON "crucible"."assistant_conversations"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."assistant_append_only"();
--> statement-breakpoint
CREATE TRIGGER "assistant_turns_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."assistant_turns"
FOR EACH ROW EXECUTE FUNCTION "crucible"."assistant_append_only"();
--> statement-breakpoint
CREATE TRIGGER "assistant_turns_no_truncate" BEFORE TRUNCATE ON "crucible"."assistant_turns"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."assistant_append_only"();
