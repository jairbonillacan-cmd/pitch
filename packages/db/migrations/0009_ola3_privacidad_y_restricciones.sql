ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "public_profile" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_provider_customer_uq" ON "subscriptions" USING btree ("provider","provider_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_account_provider_account_uq" ON "auth_account" USING btree ("provider_id","account_id");
