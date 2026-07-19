CREATE TABLE "goals_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"tracking_since_month" varchar(7),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- priority is NOT NULL in the schema, but existing goals have no value yet, so
-- add it nullable, backfill to creation order (the ladder rank they had
-- implicitly), then enforce NOT NULL. (Hand-added DML — see PR body; the CI
-- drift check regenerates DDL from schema.ts only, so this is safe.)
ALTER TABLE "savings_goals" ADD COLUMN "priority" integer;--> statement-breakpoint
UPDATE "savings_goals" AS g
SET "priority" = ranked.rn
FROM (
	SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS rn
	FROM "savings_goals"
) AS ranked
WHERE g."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "savings_goals" ALTER COLUMN "priority" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
-- Seed the single goals-settings row (id=1, mirrors monthly_targets). Tracking
-- since = the earliest existing goal's start month; NULL when no goals exist
-- (fresh installs converge when the first goal is created — see src/lib/goals).
INSERT INTO "goals_settings" ("id", "tracking_since_month")
VALUES (1, (SELECT MIN("start_month") FROM "savings_goals"))
ON CONFLICT ("id") DO NOTHING;
