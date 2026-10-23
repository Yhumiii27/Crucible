CREATE TABLE "crucible"."assistant_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"user_id" uuid NOT NULL,
	"user_name" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_conversations_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "crucible"."assistant_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"role" text NOT NULL,
	"question" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"answer" jsonb NOT NULL,
	"api_messages" jsonb,
	"lookups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft" jsonb,
	"notice" text,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_turns_seq_uq" UNIQUE("conversation_id","seq")
);
--> statement-breakpoint
ALTER TABLE "crucible"."assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "crucible"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crucible"."assistant_turns" ADD CONSTRAINT "assistant_turns_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "crucible"."assistant_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_conversations_user_idx" ON "crucible"."assistant_conversations" USING btree ("user_id","created_at");