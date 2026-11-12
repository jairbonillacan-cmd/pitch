ALTER TABLE "tipstar_commission_ledger" ADD COLUMN "stripe_transfer_id" text;--> statement-breakpoint
ALTER TABLE "tipstar_profiles" ADD COLUMN "connect_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tipstar_commission_ledger" ADD CONSTRAINT "tipstar_commission_ledger_stripe_transfer_id_unique" UNIQUE("stripe_transfer_id");--> statement-breakpoint
ALTER TABLE "tipstar_profiles" ADD CONSTRAINT "tipstar_profiles_stripe_connect_account_id_unique" UNIQUE("stripe_connect_account_id");