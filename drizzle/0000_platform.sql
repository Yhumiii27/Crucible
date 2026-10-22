CREATE TABLE "crucible"."entities" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."facilities" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"site_code" text NOT NULL,
	"operator_entity_code" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."facility_partners" (
	"facility_code" text NOT NULL,
	"entity_code" text NOT NULL,
	CONSTRAINT "facility_partners_pk" PRIMARY KEY("facility_code","entity_code")
);
--> statement-breakpoint
CREATE TABLE "crucible"."projects" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"entity_code" text NOT NULL,
	"priority_class" text DEFAULT 'P2' NOT NULL,
	"confidential" boolean DEFAULT false NOT NULL,
	"keystone_code" text,
	"codex_program_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_ref" text,
	"from_on" date,
	"to_on" date,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."sites" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"country_iso2" text DEFAULT 'FR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entra_object_id" text,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"job_title" text,
	"entity_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_entra_object_id_unique" UNIQUE("entra_object_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "crucible"."activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"project_code" text
);
--> statement-breakpoint
CREATE TABLE "crucible"."app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"actor_role" text,
	"object_ref" text NOT NULL,
	"change" text NOT NULL,
	"area" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"project_code" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "crucible"."job_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"lease_until" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_status" text,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "crucible"."facilities" ADD CONSTRAINT "facilities_site_code_sites_code_fk" FOREIGN KEY ("site_code") REFERENCES "crucible"."sites"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."facilities" ADD CONSTRAINT "facilities_operator_entity_code_entities_code_fk" FOREIGN KEY ("operator_entity_code") REFERENCES "crucible"."entities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."facility_partners" ADD CONSTRAINT "facility_partners_facility_code_facilities_code_fk" FOREIGN KEY ("facility_code") REFERENCES "crucible"."facilities"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."facility_partners" ADD CONSTRAINT "facility_partners_entity_code_entities_code_fk" FOREIGN KEY ("entity_code") REFERENCES "crucible"."entities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."projects" ADD CONSTRAINT "projects_entity_code_entities_code_fk" FOREIGN KEY ("entity_code") REFERENCES "crucible"."entities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crucible"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."users" ADD CONSTRAINT "users_entity_code_entities_code_fk" FOREIGN KEY ("entity_code") REFERENCES "crucible"."entities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."activity_events" ADD CONSTRAINT "activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."activity_events" ADD CONSTRAINT "activity_events_project_code_projects_code_fk" FOREIGN KEY ("project_code") REFERENCES "crucible"."projects"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."audit_entries" ADD CONSTRAINT "audit_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."audit_entries" ADD CONSTRAINT "audit_entries_project_code_projects_code_fk" FOREIGN KEY ("project_code") REFERENCES "crucible"."projects"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_assignments_user_idx" ON "crucible"."role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_events_occurred_at_idx" ON "crucible"."activity_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_entries_occurred_at_idx" ON "crucible"."audit_entries" USING btree ("occurred_at");