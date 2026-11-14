ALTER TABLE "user_preferences" ADD COLUMN "featured_badges" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_featured_badges_ck" CHECK (cardinality("user_preferences"."featured_badges") <= 3);
