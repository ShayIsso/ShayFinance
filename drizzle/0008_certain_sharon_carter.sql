CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"onboarding_completed_at" timestamp,
	"app_password_hash" text,
	"categorization_provider" text,
	"categorization_api_key_encrypted" "bytea",
	"categorization_api_key_iv" "bytea",
	"categorization_api_key_auth_tag" "bytea",
	"updated_at" timestamp DEFAULT now() NOT NULL
);
