CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"start_month" varchar(7) NOT NULL,
	"opening_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"target_month" varchar(7),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
