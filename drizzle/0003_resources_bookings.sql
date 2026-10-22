CREATE TABLE "crucible"."bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"project_code" text NOT NULL,
	"entity_code" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"setup_minutes" integer DEFAULT 0 NOT NULL,
	"teardown_minutes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"operators" text,
	"requested_by_user_id" uuid,
	"requested_by_name" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"confirmed_by_name" text,
	"confirmed_at" timestamp with time zone,
	"cancel_reason" text,
	"source" text DEFAULT 'crucible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "crucible"."closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_code" text,
	"from_on" date NOT NULL,
	"to_on" date NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."entity_agreements" (
	"facility_code" text NOT NULL,
	"entity_code" text NOT NULL,
	"quota_days_per_month" smallint,
	"notice_workdays" smallint DEFAULT 10 NOT NULL,
	"note" text,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_agreements_pk" PRIMARY KEY("facility_code","entity_code")
);
--> statement-breakpoint
CREATE TABLE "crucible"."exclusion_rule_resources" (
	"rule_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	CONSTRAINT "exclusion_rule_resources_pk" PRIMARY KEY("rule_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "crucible"."exclusion_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"max_active" smallint DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"motive" text NOT NULL,
	"codex_ref" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_by_name" text NOT NULL,
	"validated_by_name" text,
	"validated_at" timestamp with time zone,
	"retired_by_name" text,
	"retired_at" timestamp with time zone,
	"retired_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exclusion_rules_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "crucible"."facility_hours" (
	"facility_code" text NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" text NOT NULL,
	"closes_at" text NOT NULL,
	CONSTRAINT "facility_hours_pk" PRIMARY KEY("facility_code","weekday")
);
--> statement-breakpoint
CREATE TABLE "crucible"."inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"label" text NOT NULL,
	"period_months" smallint NOT NULL,
	"last_on" date NOT NULL,
	"codex_ref" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspections_resource_label_uq" UNIQUE("resource_id","label")
);
--> statement-breakpoint
CREATE TABLE "crucible"."resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"facility_code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"granularity" text DEFAULT 'half_day' NOT NULL,
	"capacity" smallint DEFAULT 1 NOT NULL,
	"setup_minutes" integer DEFAULT 0 NOT NULL,
	"teardown_minutes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'in_service' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "crucible"."unavailabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_project_code_projects_code_fk" FOREIGN KEY ("project_code") REFERENCES "crucible"."projects"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_entity_code_entities_code_fk" FOREIGN KEY ("entity_code") REFERENCES "crucible"."entities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."closures" ADD CONSTRAINT "closures_facility_code_facilities_code_fk" FOREIGN KEY ("facility_code") REFERENCES "crucible"."facilities"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."entity_agreements" ADD CONSTRAINT "entity_agreements_facility_code_facilities_code_fk" FOREIGN KEY ("facility_code") REFERENCES "crucible"."facilities"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."entity_agreements" ADD CONSTRAINT "entity_agreements_entity_code_entities_code_fk" FOREIGN KEY ("entity_code") REFERENCES "crucible"."entities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rule_resources" ADD CONSTRAINT "exclusion_rule_resources_rule_id_exclusion_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "crucible"."exclusion_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."exclusion_rule_resources" ADD CONSTRAINT "exclusion_rule_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."facility_hours" ADD CONSTRAINT "facility_hours_facility_code_facilities_code_fk" FOREIGN KEY ("facility_code") REFERENCES "crucible"."facilities"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."inspections" ADD CONSTRAINT "inspections_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD CONSTRAINT "resources_facility_code_facilities_code_fk" FOREIGN KEY ("facility_code") REFERENCES "crucible"."facilities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."unavailabilities" ADD CONSTRAINT "unavailabilities_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_resource_idx" ON "crucible"."bookings" USING btree ("resource_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_project_idx" ON "crucible"."bookings" USING btree ("project_code");--> statement-breakpoint
CREATE INDEX "resources_facility_idx" ON "crucible"."resources" USING btree ("facility_code");--> statement-breakpoint
CREATE INDEX "unavailabilities_resource_idx" ON "crucible"."unavailabilities" USING btree ("resource_id","starts_at");