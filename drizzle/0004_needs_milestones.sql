CREATE TABLE "crucible"."project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_code" text NOT NULL,
	"label" text NOT NULL,
	"due_on" date NOT NULL,
	"criticality" text DEFAULT 'internal' NOT NULL,
	"source" text DEFAULT 'crucible' NOT NULL,
	"source_ref" text,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."test_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"project_code" text NOT NULL,
	"milestone_id" uuid,
	"test_type_code" text,
	"resource_id" uuid NOT NULL,
	"level" text NOT NULL,
	"title" text NOT NULL,
	"half_days" smallint NOT NULL,
	"earliest_on" date NOT NULL,
	"deadline_on" date NOT NULL,
	"codex_ref" text,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"withdrawn_reason" text,
	"requested_by_user_id" uuid,
	"requested_by_name" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_needs_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "crucible"."test_types" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"nominal_resource_id" uuid,
	"typical_half_days" smallint DEFAULT 2 NOT NULL,
	"skills" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD COLUMN "need_id" uuid;--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD COLUMN "codex_ref" text;--> statement-breakpoint
ALTER TABLE "crucible"."project_milestones" ADD CONSTRAINT "project_milestones_project_code_projects_code_fk" FOREIGN KEY ("project_code") REFERENCES "crucible"."projects"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_project_code_projects_code_fk" FOREIGN KEY ("project_code") REFERENCES "crucible"."projects"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "crucible"."project_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_test_type_code_test_types_code_fk" FOREIGN KEY ("test_type_code") REFERENCES "crucible"."test_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_needs" ADD CONSTRAINT "test_needs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_types" ADD CONSTRAINT "test_types_nominal_resource_id_resources_id_fk" FOREIGN KEY ("nominal_resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_milestones_project_idx" ON "crucible"."project_milestones" USING btree ("project_code","due_on");--> statement-breakpoint
CREATE INDEX "test_needs_project_idx" ON "crucible"."test_needs" USING btree ("project_code");--> statement-breakpoint
CREATE INDEX "test_needs_resource_idx" ON "crucible"."test_needs" USING btree ("resource_id","deadline_on");--> statement-breakpoint
ALTER TABLE "crucible"."bookings" ADD CONSTRAINT "bookings_need_id_test_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "crucible"."test_needs"("id") ON DELETE no action ON UPDATE no action;