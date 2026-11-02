CREATE TABLE "crucible"."charge_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"entity_code" text,
	"cents_per_hour" integer NOT NULL,
	"valid_from" date NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by_name" text
);
--> statement-breakpoint
ALTER TABLE "crucible"."charge_rates" ADD CONSTRAINT "charge_rates_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."charge_rates" ADD CONSTRAINT "charge_rates_entity_code_entities_code_fk" FOREIGN KEY ("entity_code") REFERENCES "crucible"."entities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charge_rates_resource_idx" ON "crucible"."charge_rates" USING btree ("resource_id","valid_from");