CREATE TABLE "crucible"."incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"kind" text NOT NULL,
	"resource_id" uuid,
	"person_id" uuid,
	"need_id" uuid,
	"label" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"unavailability_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"declared_by_user_id" uuid,
	"declared_by_name" text NOT NULL,
	"declared_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "crucible"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"href" text,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crucible"."scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"kind" text NOT NULL,
	"incident_id" uuid,
	"hypothesis" jsonb,
	"moves" jsonb NOT NULL,
	"impacts" jsonb NOT NULL,
	"rule_version" integer NOT NULL,
	"status" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	CONSTRAINT "scenarios_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "crucible"."weekly_snapshots" (
	"monday" date NOT NULL,
	"resource_id" uuid NOT NULL,
	"net_open_hours" real NOT NULL,
	"booked_hours" real NOT NULL,
	"realised_hours" real NOT NULL,
	"realised_with_prep_hours" real NOT NULL,
	"blocked_hours" real NOT NULL,
	"no_shows" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "weekly_snapshots_uq" UNIQUE("monday","resource_id")
);
--> statement-breakpoint
ALTER TABLE "crucible"."facilities" ADD COLUMN "acquisition_keur" integer;--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "crucible"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_need_id_test_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "crucible"."test_needs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_unavailability_id_unavailabilities_id_fk" FOREIGN KEY ("unavailability_id") REFERENCES "crucible"."unavailabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."incidents" ADD CONSTRAINT "incidents_declared_by_user_id_users_id_fk" FOREIGN KEY ("declared_by_user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crucible"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."scenarios" ADD CONSTRAINT "scenarios_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "crucible"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."weekly_snapshots" ADD CONSTRAINT "weekly_snapshots_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "crucible"."notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "scenarios_incident_idx" ON "crucible"."scenarios" USING btree ("incident_id");