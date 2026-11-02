-- Custom SQL migration file, put your code below! ---- Events of the bench systems' API (CR-083, X-17), written by triggers in the transaction of the change so that no write path
-- of Crucible can forget one. A booking: created (booking.<status>), its status changed (booking.<new status>), or moved in
-- time or to another resource (booking.moved, on the old resource and on the new one). The history import (source 'import')
-- writes none. An incident on a resource: declared or closed (incident.<status>). The events are append-only.
CREATE OR REPLACE FUNCTION "crucible"."bookings_api_event"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source = 'import' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "crucible"."api_events" ("kind", "booking_id", "resource_id") VALUES ('booking.' || NEW.status, NEW.id, NEW.resource_id);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO "crucible"."api_events" ("kind", "booking_id", "resource_id") VALUES ('booking.' || NEW.status, NEW.id, NEW.resource_id);
  ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.resource_id IS DISTINCT FROM OLD.resource_id THEN
    IF NEW.resource_id IS DISTINCT FROM OLD.resource_id THEN
      INSERT INTO "crucible"."api_events" ("kind", "booking_id", "resource_id") VALUES ('booking.moved', NEW.id, OLD.resource_id);
    END IF;
    INSERT INTO "crucible"."api_events" ("kind", "booking_id", "resource_id") VALUES ('booking.moved', NEW.id, NEW.resource_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "bookings_api_events" AFTER INSERT OR UPDATE ON "crucible"."bookings"
FOR EACH ROW EXECUTE FUNCTION "crucible"."bookings_api_event"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "crucible"."incidents_api_event"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.resource_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO "crucible"."api_events" ("kind", "incident_id", "resource_id") VALUES ('incident.' || NEW.status, NEW.id, NEW.resource_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "incidents_api_events" AFTER INSERT OR UPDATE ON "crucible"."incidents"
FOR EACH ROW EXECUTE FUNCTION "crucible"."incidents_api_event"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "crucible"."api_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'An event of the API is kept as written.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "api_events_no_update_delete" BEFORE UPDATE OR DELETE ON "crucible"."api_events"
FOR EACH ROW EXECUTE FUNCTION "crucible"."api_events_append_only"();
--> statement-breakpoint
CREATE TRIGGER "api_events_no_truncate" BEFORE TRUNCATE ON "crucible"."api_events"
FOR EACH STATEMENT EXECUTE FUNCTION "crucible"."api_events_append_only"();
