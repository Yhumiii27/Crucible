CREATE TABLE "crucible"."consumable_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumable_id" uuid NOT NULL,
	"lot_ref" text NOT NULL,
	"expires_on" date,
	"received_by_name" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."consumable_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumable_id" uuid NOT NULL,
	"lot_id" uuid,
	"kind" text NOT NULL,
	"quantity" double precision NOT NULL,
	"booking_id" uuid,
	"reason" text,
	"by_name" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."consumables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"threshold" double precision,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."test_type_consumables" (
	"test_type_code" text NOT NULL,
	"consumable_id" uuid NOT NULL,
	"quantity" double precision NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_type_consumables_pk" PRIMARY KEY("test_type_code","consumable_id")
);
--> statement-breakpoint
ALTER TABLE "crucible"."consumable_lots" ADD CONSTRAINT "consumable_lots_consumable_id_consumables_id_fk" FOREIGN KEY ("consumable_id") REFERENCES "crucible"."consumables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."consumable_moves" ADD CONSTRAINT "consumable_moves_consumable_id_consumables_id_fk" FOREIGN KEY ("consumable_id") REFERENCES "crucible"."consumables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."consumable_moves" ADD CONSTRAINT "consumable_moves_lot_id_consumable_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "crucible"."consumable_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."consumable_moves" ADD CONSTRAINT "consumable_moves_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "crucible"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."consumables" ADD CONSTRAINT "consumables_facility_code_facilities_code_fk" FOREIGN KEY ("facility_code") REFERENCES "crucible"."facilities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_type_consumables" ADD CONSTRAINT "test_type_consumables_test_type_code_test_types_code_fk" FOREIGN KEY ("test_type_code") REFERENCES "crucible"."test_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_type_consumables" ADD CONSTRAINT "test_type_consumables_consumable_id_consumables_id_fk" FOREIGN KEY ("consumable_id") REFERENCES "crucible"."consumables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consumable_lots_consumable_idx" ON "crucible"."consumable_lots" USING btree ("consumable_id");--> statement-breakpoint
CREATE INDEX "consumable_moves_consumable_idx" ON "crucible"."consumable_moves" USING btree ("consumable_id");--> statement-breakpoint
CREATE INDEX "consumable_moves_booking_idx" ON "crucible"."consumable_moves" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "consumables_facility_idx" ON "crucible"."consumables" USING btree ("facility_code");