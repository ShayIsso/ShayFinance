ALTER TABLE "categories" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Default expense grouping (ADR-0011 §7). Idempotent: each group row is created
-- only if its name is free, and each leaf is linked only while still a root leaf
-- (parent_id IS NULL) so a user's later regrouping is never overridden. On a
-- live DB the leaves already exist and are linked here; on a fresh install the
-- backfill matches nothing (leaves are seeded afterward) and seed.ts links them
-- to these group rows. Groups carry no description — never assignable, never in
-- the AI prompt.
INSERT INTO "categories" ("name", "type", "icon", "color", "is_default")
SELECT 'אוכל', 'expense', 'Utensils', '#f59e0b', true
WHERE NOT EXISTS (SELECT 1 FROM "categories" WHERE "name" = 'אוכל');--> statement-breakpoint
UPDATE "categories" SET "parent_id" = (SELECT "id" FROM "categories" WHERE "name" = 'אוכל')
WHERE "name" IN ('מזון וסופר', 'מסעדות וקפה') AND "parent_id" IS NULL;--> statement-breakpoint
INSERT INTO "categories" ("name", "type", "icon", "color", "is_default")
SELECT 'בית וחשבונות', 'expense', 'Home', '#8b5cf6', true
WHERE NOT EXISTS (SELECT 1 FROM "categories" WHERE "name" = 'בית וחשבונות');--> statement-breakpoint
UPDATE "categories" SET "parent_id" = (SELECT "id" FROM "categories" WHERE "name" = 'בית וחשבונות')
WHERE "name" IN ('דיור ושכירות', 'חשבונות ושירותים', 'מנויים') AND "parent_id" IS NULL;--> statement-breakpoint
INSERT INTO "categories" ("name", "type", "icon", "color", "is_default")
SELECT 'פנאי וקניות', 'expense', 'ShoppingBag', '#ec4899', true
WHERE NOT EXISTS (SELECT 1 FROM "categories" WHERE "name" = 'פנאי וקניות');--> statement-breakpoint
UPDATE "categories" SET "parent_id" = (SELECT "id" FROM "categories" WHERE "name" = 'פנאי וקניות')
WHERE "name" IN ('בילויים ופנאי', 'קניות וביגוד', 'מתנות ואירועים') AND "parent_id" IS NULL;