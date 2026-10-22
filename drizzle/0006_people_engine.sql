CREATE TABLE "crucible"."arbitrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conflict_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"option_key" text,
	"order" uuid[] DEFAULT '{}' NOT NULL,
	"rule_invoked" text NOT NULL,
	"reason" text NOT NULL,
	"decided_by_name" text NOT NULL,
	"decided_by_role" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."booking_equipment" (
	"booking_id" uuid NOT NULL,
	"equipment_code" text NOT NULL,
	CONSTRAINT "booking_equipment_pk" PRIMARY KEY("booking_id","equipment_code")
);
--> statement-breakpoint
CREATE TABLE "crucible"."booking_staff" (
	"booking_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"skill_code" text,
	CONSTRAINT "booking_staff_pk" PRIMARY KEY("booking_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "crucible"."conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"run_id" uuid NOT NULL,
	"need_ids" uuid[] NOT NULL,
	"subject" text NOT NULL,
	"options" jsonb NOT NULL,
	"recommended_key" text NOT NULL,
	"rule_cited" text NOT NULL,
	"rule_rank" smallint,
	"rule_version" integer NOT NULL,
	"decider" text NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conflicts_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "crucible"."mobile_equipment" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"facility_code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_code" text NOT NULL,
	"matricule" text,
	"facility_codes" text[] DEFAULT '{}' NOT NULL,
	"user_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_matricule_unique" UNIQUE("matricule")
);
--> statement-breakpoint
CREATE TABLE "crucible"."person_absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"from_on" date NOT NULL,
	"to_on" date NOT NULL,
	"source" text DEFAULT 'crucible' NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."person_skills" (
	"person_id" uuid NOT NULL,
	"skill_code" text NOT NULL,
	"valid_until" date,
	"source" text DEFAULT 'crucible' NOT NULL,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_skills_pk" PRIMARY KEY("person_id","skill_code")
);
--> statement-breakpoint
CREATE TABLE "crucible"."plan_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"rule_version" integer NOT NULL,
	"from_on" date NOT NULL,
	"to_on" date NOT NULL,
	"trigger" text NOT NULL,
	"run_by_name" text NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"summary" jsonb NOT NULL,
	CONSTRAINT "plan_runs_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "crucible"."priority_rule_sets" (
	"version" integer PRIMARY KEY NOT NULL,
	"criteria" text[] NOT NULL,
	"note" text,
	"published_by_name" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"need_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"substitute" boolean DEFAULT false NOT NULL,
	"late_days" smallint DEFAULT 0 NOT NULL,
	"staff" jsonb NOT NULL,
	"equipment" text[] DEFAULT '{}' NOT NULL,
	"explanation" jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"booking_id" uuid,
	"decided_by_name" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crucible"."skills" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cursus_titre_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crucible"."substitutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_type_code" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"conditions" text NOT NULL,
	"codex_ref" text NOT NULL,
	"technical_referent" text NOT NULL,
	"hazardous" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_by_name" text NOT NULL,
	"host_validated_by_name" text,
	"host_validated_at" timestamp with time zone,
	"safety_validated_by_name" text,
	"safety_validated_at" timestamp with time zone,
	"retired_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "substitutions_type_resource_uq" UNIQUE("test_type_code","resource_id")
);
--> statement-breakpoint
CREATE TABLE "crucible"."test_type_equipment" (
	"test_type_code" text NOT NULL,
	"equipment_code" text NOT NULL,
	CONSTRAINT "test_type_equipment_pk" PRIMARY KEY("test_type_code","equipment_code")
);
--> statement-breakpoint
CREATE TABLE "crucible"."test_type_skills" (
	"test_type_code" text NOT NULL,
	"skill_code" text NOT NULL,
	"count" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "test_type_skills_pk" PRIMARY KEY("test_type_code","skill_code")
);
--> statement-breakpoint
ALTER TABLE "crucible"."arbitrations" ADD CONSTRAINT "arbitrations_conflict_id_conflicts_id_fk" FOREIGN KEY ("conflict_id") REFERENCES "crucible"."conflicts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."booking_equipment" ADD CONSTRAINT "booking_equipment_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "crucible"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."booking_equipment" ADD CONSTRAINT "booking_equipment_equipment_code_mobile_equipment_code_fk" FOREIGN KEY ("equipment_code") REFERENCES "crucible"."mobile_equipment"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."booking_staff" ADD CONSTRAINT "booking_staff_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "crucible"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."booking_staff" ADD CONSTRAINT "booking_staff_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "crucible"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."booking_staff" ADD CONSTRAINT "booking_staff_skill_code_skills_code_fk" FOREIGN KEY ("skill_code") REFERENCES "crucible"."skills"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."conflicts" ADD CONSTRAINT "conflicts_run_id_plan_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "crucible"."plan_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."mobile_equipment" ADD CONSTRAINT "mobile_equipment_facility_code_facilities_code_fk" FOREIGN KEY ("facility_code") REFERENCES "crucible"."facilities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."people" ADD CONSTRAINT "people_entity_code_entities_code_fk" FOREIGN KEY ("entity_code") REFERENCES "crucible"."entities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."person_absences" ADD CONSTRAINT "person_absences_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "crucible"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."person_skills" ADD CONSTRAINT "person_skills_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "crucible"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."person_skills" ADD CONSTRAINT "person_skills_skill_code_skills_code_fk" FOREIGN KEY ("skill_code") REFERENCES "crucible"."skills"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."plan_runs" ADD CONSTRAINT "plan_runs_rule_version_priority_rule_sets_version_fk" FOREIGN KEY ("rule_version") REFERENCES "crucible"."priority_rule_sets"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."proposals" ADD CONSTRAINT "proposals_run_id_plan_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "crucible"."plan_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."proposals" ADD CONSTRAINT "proposals_need_id_test_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "crucible"."test_needs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."proposals" ADD CONSTRAINT "proposals_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."proposals" ADD CONSTRAINT "proposals_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "crucible"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."substitutions" ADD CONSTRAINT "substitutions_test_type_code_test_types_code_fk" FOREIGN KEY ("test_type_code") REFERENCES "crucible"."test_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."substitutions" ADD CONSTRAINT "substitutions_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "crucible"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_type_equipment" ADD CONSTRAINT "test_type_equipment_test_type_code_test_types_code_fk" FOREIGN KEY ("test_type_code") REFERENCES "crucible"."test_types"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_type_equipment" ADD CONSTRAINT "test_type_equipment_equipment_code_mobile_equipment_code_fk" FOREIGN KEY ("equipment_code") REFERENCES "crucible"."mobile_equipment"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_type_skills" ADD CONSTRAINT "test_type_skills_test_type_code_test_types_code_fk" FOREIGN KEY ("test_type_code") REFERENCES "crucible"."test_types"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."test_type_skills" ADD CONSTRAINT "test_type_skills_skill_code_skills_code_fk" FOREIGN KEY ("skill_code") REFERENCES "crucible"."skills"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arbitrations_conflict_idx" ON "crucible"."arbitrations" USING btree ("conflict_id");--> statement-breakpoint
CREATE INDEX "booking_equipment_code_idx" ON "crucible"."booking_equipment" USING btree ("equipment_code");--> statement-breakpoint
CREATE INDEX "booking_staff_person_idx" ON "crucible"."booking_staff" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "conflicts_status_idx" ON "crucible"."conflicts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "person_absences_person_idx" ON "crucible"."person_absences" USING btree ("person_id","from_on");--> statement-breakpoint
CREATE INDEX "proposals_run_idx" ON "crucible"."proposals" USING btree ("run_id");