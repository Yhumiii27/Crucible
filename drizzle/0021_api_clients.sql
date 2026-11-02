CREATE TABLE "crucible"."api_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_code" text NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"cursor" bigint DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_delivery_at" timestamp with time zone,
	"last_error" text,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_name" text,
	CONSTRAINT "api_clients_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "crucible"."api_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"booking_id" uuid,
	"incident_id" uuid,
	"resource_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crucible"."api_clients" ADD CONSTRAINT "api_clients_facility_code_facilities_code_fk" FOREIGN KEY ("facility_code") REFERENCES "crucible"."facilities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."api_events" ADD CONSTRAINT "api_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "crucible"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."api_events" ADD CONSTRAINT "api_events_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "crucible"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."api_events" ADD CONSTRAINT "api_events_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_clients_facility_idx" ON "crucible"."api_clients" USING btree ("facility_code");--> statement-breakpoint
CREATE INDEX "api_events_resource_idx" ON "crucible"."api_events" USING btree ("resource_id","seq");