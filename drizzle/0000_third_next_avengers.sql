CREATE TYPE "public"."bank_type" AS ENUM('discount', 'max', 'visaCal');--> statement-breakpoint
CREATE TYPE "public"."category_type" AS ENUM('income', 'expense', 'investment', 'transfer', 'ignore');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('contains', 'starts_with', 'exact', 'regex');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_role" AS ENUM('settlement_lump', 'settlement_detail', 'transfer_pair');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('completed', 'pending');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('normal', 'installments');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credential_id" uuid NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"balance" numeric(12, 2),
	"balance_updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_type" "bank_type" NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"encrypted_credentials" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "category_type" NOT NULL,
	"icon" varchar(50) NOT NULL,
	"color" varchar(7) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"match_type" "match_type" NOT NULL,
	"pattern" varchar(500) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"external_id" varchar(100),
	"date" date NOT NULL,
	"processed_date" date NOT NULL,
	"description" varchar(500) NOT NULL,
	"custom_description" varchar(500),
	"memo" text,
	"original_amount" numeric(12, 2) NOT NULL,
	"original_currency" varchar(3) NOT NULL,
	"charged_amount" numeric(12, 2) NOT NULL,
	"charged_currency" varchar(3),
	"type" "transaction_type" NOT NULL,
	"installment_number" integer,
	"installment_total" integer,
	"status" "transaction_status" NOT NULL,
	"category_id" uuid,
	"reconciliation_group_id" uuid,
	"reconciliation_role" "reconciliation_role",
	"reconciliation_confidence" real,
	"reconciliation_confirmed_at" timestamp,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_credential_id_bank_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."bank_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bank_account" ON "bank_accounts" USING btree ("credential_id","account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_category_name" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_external_id_account" ON "transactions" USING btree ("external_id","bank_account_id") WHERE external_id IS NOT NULL;