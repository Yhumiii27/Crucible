CREATE TABLE "crucible"."calendar_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"scope" text NOT NULL,
	"resource_id" uuid,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "calendar_feeds_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "crucible"."occupancy_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_name" text,
	CONSTRAINT "occupancy_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "crucible"."occupancy_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"booking_id" uuid,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "crucible"."notifications" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "crucible"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_devices" ADD CONSTRAINT "occupancy_devices_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_events" ADD CONSTRAINT "occupancy_events_device_id_occupancy_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "crucible"."occupancy_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_events" ADD CONSTRAINT "occupancy_events_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."occupancy_events" ADD CONSTRAINT "occupancy_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "crucible"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_feeds_user_idx" ON "crucible"."calendar_feeds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "occupancy_devices_resource_idx" ON "crucible"."occupancy_devices" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "occupancy_events_resource_idx" ON "crucible"."occupancy_events" USING btree ("resource_id","occurred_at");--> statement-breakpoint
ALTER TABLE "crucible"."notifications" ADD CONSTRAINT "notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "crucible"."bookings"("id") ON DELETE no action ON UPDATE no action;