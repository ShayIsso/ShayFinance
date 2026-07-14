CREATE TYPE "public"."ai_suggestion_status" AS ENUM('pending_review', 'auto_applied', 'accepted', 'rejected', 'undone');--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"confidence" integer NOT NULL,
	"model" varchar(100) NOT NULL,
	"status" "ai_suggestion_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_suggestions_txn_category" ON "ai_suggestions" USING btree ("transaction_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_ai_suggestions_status" ON "ai_suggestions" USING btree ("status");