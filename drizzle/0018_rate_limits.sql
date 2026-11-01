CREATE TABLE "crucible"."rate_counters" (
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_counters_pk" PRIMARY KEY("bucket","key","window_start")
);
--> statement-breakpoint
CREATE INDEX "rate_counters_window_idx" ON "crucible"."rate_counters" USING btree ("window_start");