CREATE TABLE "crucible"."form_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"version" integer NOT NULL,
	"items" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"filled_by_user_id" uuid,
	"filled_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_code" text NOT NULL,
	"stage" text NOT NULL,
	"items" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_templates_facility_stage_uq" UNIQUE("facility_code","stage")
);
--> statement-breakpoint
ALTER TABLE "crucible"."form_responses" ADD CONSTRAINT "form_responses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "crucible"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."form_responses" ADD CONSTRAINT "form_responses_template_id_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "crucible"."form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."form_responses" ADD CONSTRAINT "form_responses_filled_by_user_id_users_id_fk" FOREIGN KEY ("filled_by_user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."form_templates" ADD CONSTRAINT "form_templates_facility_code_facilities_code_fk" FOREIGN KEY ("facility_code") REFERENCES "crucible"."facilities"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_responses_booking_idx" ON "crucible"."form_responses" USING btree ("booking_id","stage");