ALTER TABLE "user_preferences" ADD COLUMN "record_privacy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "bankroll_start_mxn_centavos" integer;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_bankroll_ck" CHECK ("user_preferences"."bankroll_start_mxn_centavos" IS NULL OR ("user_preferences"."bankroll_start_mxn_centavos" >= 0 AND "user_preferences"."bankroll_start_mxn_centavos" <= 1000000000));
