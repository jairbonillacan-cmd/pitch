CREATE TABLE "match_frozen_picks" (
	"game_id" text PRIMARY KEY NOT NULL,
	"pick_id" text NOT NULL,
	"pick_label" text NOT NULL,
	"category_label" text NOT NULL,
	"market_group" text NOT NULL,
	"selection_key" text NOT NULL,
	"probability" numeric(6, 5) NOT NULL,
	"fair_decimal" numeric(8, 3) NOT NULL,
	"fair_american" integer NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"freeze_at" timestamp with time zone NOT NULL,
	"frozen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_frozen_picks_game_id_ck" CHECK ("match_frozen_picks"."game_id" ~ '^[a-zA-Z0-9._-]{1,128}$'),
	CONSTRAINT "match_frozen_picks_probability_ck" CHECK ("match_frozen_picks"."probability" > 0 AND "match_frozen_picks"."probability" < 1),
	CONSTRAINT "match_frozen_picks_fair_decimal_ck" CHECK ("match_frozen_picks"."fair_decimal" > 1),
	CONSTRAINT "match_frozen_picks_freeze_window_ck" CHECK ("match_frozen_picks"."freeze_at" < "match_frozen_picks"."kickoff_at")
);
