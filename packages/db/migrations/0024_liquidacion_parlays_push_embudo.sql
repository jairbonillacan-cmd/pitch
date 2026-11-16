ALTER TABLE "sealed_picks" ADD COLUMN IF NOT EXISTS "pick_kind" text DEFAULT 'single' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sealed_picks" ADD COLUMN IF NOT EXISTS "pick_market" text;
--> statement-breakpoint
ALTER TABLE "sealed_picks" ADD COLUMN IF NOT EXISTS "pick_selection" text;
--> statement-breakpoint
ALTER TABLE "sealed_picks" ADD COLUMN IF NOT EXISTS "pick_line" numeric(6, 2);
--> statement-breakpoint
ALTER TABLE "sealed_picks" ADD COLUMN IF NOT EXISTS "parlay_legs" jsonb;
--> statement-breakpoint
ALTER TABLE "sealed_picks" ADD COLUMN IF NOT EXISTS "parlay_leg_results" jsonb;
--> statement-breakpoint
ALTER TABLE "sealed_picks" ADD COLUMN IF NOT EXISTS "closing_decimal" numeric(7, 3);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sealed_picks" ADD CONSTRAINT "sealed_picks_kind_ck" CHECK ("pick_kind" IN ('single', 'parlay'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sealed_picks_status_kickoff_idx" ON "sealed_picks" USING btree ("status", "kickoff_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_sealed_pick_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "users" WHERE "id" = OLD."user_id") THEN
      RAISE EXCEPTION 'sealed_picks_immutable: no se permite eliminar picks sellados directamente';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."user_id" IS DISTINCT FROM NEW."user_id"
       OR OLD."pick_id" IS DISTINCT FROM NEW."pick_id"
       OR OLD."game_id" IS DISTINCT FROM NEW."game_id"
       OR OLD."league_label" IS DISTINCT FROM NEW."league_label"
       OR OLD."match_label" IS DISTINCT FROM NEW."match_label"
       OR OLD."pick_label" IS DISTINCT FROM NEW."pick_label"
       OR OLD."origin" IS DISTINCT FROM NEW."origin"
       OR OLD."units" IS DISTINCT FROM NEW."units"
       OR OLD."user_decimal" IS DISTINCT FROM NEW."user_decimal"
       OR OLD."fair_decimal" IS DISTINCT FROM NEW."fair_decimal"
       OR OLD."note" IS DISTINCT FROM NEW."note"
       OR OLD."seal_hash" IS DISTINCT FROM NEW."seal_hash"
       OR OLD."sealed_at" IS DISTINCT FROM NEW."sealed_at"
       OR OLD."kickoff_at" IS DISTINCT FROM NEW."kickoff_at"
       OR OLD."pick_kind" IS DISTINCT FROM NEW."pick_kind"
       OR OLD."pick_market" IS DISTINCT FROM NEW."pick_market"
       OR OLD."pick_selection" IS DISTINCT FROM NEW."pick_selection"
       OR OLD."pick_line" IS DISTINCT FROM NEW."pick_line"
       OR OLD."parlay_legs" IS DISTINCT FROM NEW."parlay_legs"
    THEN
      RAISE EXCEPTION 'sealed_picks_immutable: los campos sellados no pueden modificarse';
    END IF;

    IF OLD."status" <> 'pending' AND (
       OLD."status" IS DISTINCT FROM NEW."status"
       OR OLD."settled_at" IS DISTINCT FROM NEW."settled_at"
       OR OLD."clv_pct" IS DISTINCT FROM NEW."clv_pct"
       OR OLD."closing_decimal" IS DISTINCT FROM NEW."closing_decimal"
       OR OLD."parlay_leg_results" IS DISTINCT FROM NEW."parlay_leg_results"
    ) THEN
      RAISE EXCEPTION 'sealed_picks_immutable: un pick ya calificado no puede volver a modificarse';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "email_weekly_digest" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "email_monthly_record" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "push_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "closing_odds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" text NOT NULL,
  "market" text NOT NULL,
  "selection" text NOT NULL,
  "line_key" text DEFAULT '' NOT NULL,
  "book" text NOT NULL,
  "decimal_odds" numeric(7, 3) NOT NULL,
  "fair_decimal" numeric(7, 3),
  "no_vig_prob" numeric(6, 5),
  "source" text NOT NULL,
  "kickoff_at" timestamp with time zone NOT NULL,
  "captured_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "closing_odds_before_kickoff_ck" CHECK ("captured_at" <= "kickoff_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "closing_odds_key_uq" ON "closing_odds" USING btree ("game_id", "market", "selection", "line_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "closing_odds_kickoff_idx" ON "closing_odds" USING btree ("kickoff_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cortex_cache" (
  "cache_key" text PRIMARY KEY NOT NULL,
  "game_id" text NOT NULL,
  "facts_hash" text NOT NULL,
  "model" text NOT NULL,
  "summary" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cortex_cache_game_idx" ON "cortex_cache" USING btree ("game_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cortex_cache_expires_idx" ON "cortex_cache" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "topic_picks" boolean DEFAULT true NOT NULL,
  "topic_live" boolean DEFAULT true NOT NULL,
  "topic_social" boolean DEFAULT true NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_sent_at" timestamp with time zone,
  CONSTRAINT "push_subscriptions_endpoint_uq" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "funnel_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_name" text NOT NULL,
  "stage_order" integer NOT NULL,
  "session_hash" text NOT NULL,
  "user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "source_path" text,
  "meta" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "funnel_events_name_ck" CHECK ("event_name" IN ('landing', 'signup_step1', 'signup_step2', 'first_sealed_pick', 'spei_transfer', 'coupon_redeemed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "funnel_events_session_event_uq" ON "funnel_events" USING btree ("session_hash", "event_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funnel_events_name_created_idx" ON "funnel_events" USING btree ("event_name", "created_at");
