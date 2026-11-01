-- Custom SQL migration file, put your code below! --
-- The events of the occupancy devices are never changed (CR-071, X-8): what a device sent and what it did to the booking stays
-- as received. Same triggers as the audit trail (0001_audit_append_only): UPDATE and DELETE refused row by row, TRUNCATE refused.
CREATE OR REPLACE FUNCTION "crucible"."occupancy_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'A device event is kept as received.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "occupancy_events_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."occupancy_events"
FOR EACH ROW EXECUTE FUNCTION "crucible"."occupancy_events_append_only"();
--> statement-breakpoint
CREATE TRIGGER "occupancy_events_no_truncate" BEFORE TRUNCATE ON "crucible"."occupancy_events"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."occupancy_events_append_only"();
