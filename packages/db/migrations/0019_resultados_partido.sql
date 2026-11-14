CREATE TABLE "match_results" (
	"game_id" text PRIMARY KEY NOT NULL,
	"home_score" integer NOT NULL,
	"away_score" integer NOT NULL,
	"outcome" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_results_outcome_ck" CHECK ("match_results"."outcome" IN ('home', 'draw', 'away')),
	CONSTRAINT "match_results_scores_ck" CHECK ("match_results"."home_score" >= 0 AND "match_results"."away_score" >= 0),
	CONSTRAINT "match_results_game_id_ck" CHECK ("match_results"."game_id" ~ '^[a-zA-Z0-9._-]{1,128}$')
);
