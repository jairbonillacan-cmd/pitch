-- EN-VIVO-1: «Siguiendo» con avisos por partido, mapeo de ids de proveedor, caché compartida del
-- lector en vivo (un solo lector en servidor para todos los navegadores), cuota diaria del
-- proveedor y bitácora de momentos del partido (inicio, gol, medio tiempo, final).
ALTER TABLE "watchlist" ADD COLUMN IF NOT EXISTS "alert_kickoff" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN IF NOT EXISTS "alert_goals" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "watchlist" ADD COLUMN IF NOT EXISTS "alert_final" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_game_idx" ON "watchlist" USING btree ("game_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_match_links" (
	"provider" text NOT NULL,
	"game_id" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"method" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_match_links_pk" PRIMARY KEY("provider","game_id"),
	CONSTRAINT "provider_match_links_provider_ck" CHECK ("provider" IN ('bzzoiro')),
	CONSTRAINT "provider_match_links_game_id_ck" CHECK ("game_id" ~ '^[a-zA-Z0-9._-]{1,128}$'),
	CONSTRAINT "provider_match_links_event_ck" CHECK ("provider_event_id" ~ '^[0-9]{1,18}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_match_links_event_uidx" ON "provider_match_links" USING btree ("provider","provider_event_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_feed_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"fresh_until" timestamp with time zone NOT NULL,
	"refresh_lease_until" timestamp with time zone,
	CONSTRAINT "live_feed_cache_key_ck" CHECK ("cache_key" ~ '^[a-z0-9:._-]{1,160}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_quota" (
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"remaining" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_quota_pk" PRIMARY KEY("provider","day"),
	CONSTRAINT "provider_quota_requests_ck" CHECK ("requests" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" text NOT NULL,
	"kind" text NOT NULL,
	"side" text,
	"minute" integer,
	"home_score" integer NOT NULL,
	"away_score" integer NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_match_events_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "live_match_events_kind_ck" CHECK ("kind" IN ('kickoff', 'goal', 'halftime', 'final')),
	CONSTRAINT "live_match_events_side_ck" CHECK ("side" IS NULL OR "side" IN ('home', 'away')),
	CONSTRAINT "live_match_events_scores_ck" CHECK ("home_score" >= 0 AND "away_score" >= 0),
	CONSTRAINT "live_match_events_game_id_ck" CHECK ("game_id" ~ '^[a-zA-Z0-9._-]{1,128}$')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "live_match_events_game_time_idx" ON "live_match_events" USING btree ("game_id","occurred_at");
