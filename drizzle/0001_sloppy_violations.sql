CREATE TYPE "public"."category_source" AS ENUM('rule', 'memory', 'ai', 'user');--> statement-breakpoint
CREATE TYPE "public"."memory_source" AS ENUM('user', 'ai');--> statement-breakpoint
CREATE TABLE "category_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"merchant_key" text NOT NULL,
	"description_redacted" text NOT NULL,
	"from_category_name" text NOT NULL,
	"to_category_name" text NOT NULL,
	"from_category_id" uuid,
	"to_category_id" uuid,
	"from_source" "category_source" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_key" text NOT NULL,
	"category_id" uuid NOT NULL,
	"source" "memory_source" NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_source" "category_source";--> statement-breakpoint
ALTER TABLE "category_corrections" ADD CONSTRAINT "category_corrections_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_corrections" ADD CONSTRAINT "category_corrections_from_category_id_categories_id_fk" FOREIGN KEY ("from_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_corrections" ADD CONSTRAINT "category_corrections_to_category_id_categories_id_fk" FOREIGN KEY ("to_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_memory" ADD CONSTRAINT "merchant_memory_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_merchant_memory_key" ON "merchant_memory" USING btree ("merchant_key");