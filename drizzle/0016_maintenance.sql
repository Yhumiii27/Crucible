CREATE TABLE "crucible"."maintenance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"period_months" smallint NOT NULL,
	"last_on" date NOT NULL,
	"provider" text,
	"blocking" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_plans_resource_label_uq" UNIQUE("resource_id","label")
);
--> statement-breakpoint
CREATE TABLE "crucible"."maintenance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"done_on" date NOT NULL,
	"provider" text,
	"note" text,
	"codex_ref" text,
	"recorded_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crucible"."maintenance_plans" ADD CONSTRAINT "maintenance_plans_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."maintenance_records" ADD CONSTRAINT "maintenance_records_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "crucible"."maintenance_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_records_plan_idx" ON "crucible"."maintenance_records" USING btree ("plan_id","done_on");