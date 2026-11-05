ALTER TABLE "crucible"."entities" ADD COLUMN "matrix_code" text;--> statement-breakpoint
ALTER TABLE "crucible"."sites" ADD COLUMN "matrix_code" text;--> statement-breakpoint
ALTER TABLE "crucible"."entities" ADD CONSTRAINT "entities_matrix_code_unique" UNIQUE("matrix_code");--> statement-breakpoint
ALTER TABLE "crucible"."sites" ADD CONSTRAINT "sites_matrix_code_unique" UNIQUE("matrix_code");