ALTER TABLE "crucible"."inspections" ADD COLUMN "source" text DEFAULT 'crucible' NOT NULL;--> statement-breakpoint
ALTER TABLE "crucible"."inspections" ADD COLUMN "source_ref" text;