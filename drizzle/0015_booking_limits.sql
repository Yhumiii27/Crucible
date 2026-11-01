ALTER TABLE "crucible"."bookings" ADD COLUMN "series_ref" text;--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD COLUMN "buffer_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD COLUMN "min_notice_hours" integer;--> statement-breakpoint
ALTER TABLE "crucible"."resources" ADD COLUMN "max_days" smallint;