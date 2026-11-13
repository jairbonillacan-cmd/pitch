CREATE TABLE "match_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"question" text NOT NULL,
	"choice" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_votes_question_ck" CHECK ("match_votes"."question" IN ('ganador', 'pick')),
	CONSTRAINT "match_votes_choice_ck" CHECK (("match_votes"."question" = 'ganador' AND "match_votes"."choice" IN ('home', 'draw', 'away')) OR ("match_votes"."question" = 'pick' AND "match_votes"."choice" IN ('si', 'no'))),
	CONSTRAINT "match_votes_game_id_ck" CHECK ("match_votes"."game_id" ~ '^[a-zA-Z0-9._-]{1,128}$')
);
--> statement-breakpoint
ALTER TABLE "match_votes" ADD CONSTRAINT "match_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_votes_user_game_question_uidx" ON "match_votes" USING btree ("user_id","game_id","question");--> statement-breakpoint
CREATE INDEX "match_votes_game_question_idx" ON "match_votes" USING btree ("game_id","question");
