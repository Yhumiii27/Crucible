CREATE TABLE "crucible"."vigie_zone_resources" (
	"zone_id" integer NOT NULL,
	"resource_id" uuid NOT NULL,
	"set_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vigie_zone_resources_pk" PRIMARY KEY("zone_id","resource_id")
);
--> statement-breakpoint
ALTER TABLE "crucible"."unavailabilities" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "crucible"."vigie_zone_resources" ADD CONSTRAINT "vigie_zone_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE cascade ON UPDATE no action;