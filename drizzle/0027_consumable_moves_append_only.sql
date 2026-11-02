-- Custom SQL migration file, put your code below! ---- The moves of the stock of consumables are kept as recorded (CR-076, X-20): a mistake is corrected by a count adjustment.
-- Same triggers as the audit trail (0001_audit_append_only): UPDATE and DELETE refused row by row, TRUNCATE refused.
CREATE OR REPLACE FUNCTION "crucible"."consumable_moves_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'A move of the stock is corrected by a count adjustment.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "consumable_moves_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."consumable_moves"
FOR EACH ROW EXECUTE FUNCTION "crucible"."consumable_moves_append_only"();
--> statement-breakpoint
CREATE TRIGGER "consumable_moves_no_truncate" BEFORE TRUNCATE ON "crucible"."consumable_moves"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."consumable_moves_append_only"();
