CREATE TABLE "crucible"."test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"outcome" text NOT NULL,
	"measurements" jsonb NOT NULL,
	"observations" text,
	"raw_data_ref" text,
	"notebook_ref" text,
	"eln_url" text,
	"reason" text,
	"recorded_by_user_id" uuid,
	"recorded_by_name" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_results_booking_version_uq" UNIQUE("booking_id","version")
);
--> statement-breakpoint
ALTER TABLE "crucible"."test_results" ADD CONSTRAINT "test_results_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "crucible"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_results" ADD CONSTRAINT "test_results_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_results_booking_idx" ON "crucible"."test_results" USING btree ("booking_id");