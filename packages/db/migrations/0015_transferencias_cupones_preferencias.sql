-- Beta 1.0: solicitudes de transferencia SPEI, cupones de acceso, preferencias en DB y ciclo de correos.
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "theme_mode" text DEFAULT 'dark' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'America/Mexico_City' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "show_mxn_balance" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "email_value_alerts" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "email_before_match" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "email_billing_reminder" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "show_in_ranking" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "pause_community" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "responsible_pause_kind" text;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "responsible_pause_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_theme_ck" CHECK ("user_preferences"."theme_mode" IN ('dark', 'light', 'system'));
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_pause_ck" CHECK ("user_preferences"."responsible_pause_kind" IS NULL OR "user_preferences"."responsible_pause_kind" IN ('24h', '7d', '30d'));
--> statement-breakpoint
DROP INDEX IF EXISTS "scheduled_emails_user_kind_uq";
--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD COLUMN IF NOT EXISTS "cycle_key" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_emails_user_kind_cycle_uq" ON "scheduled_emails" USING btree ("user_id","kind","cycle_key");
--> statement-breakpoint
CREATE INDEX "scheduled_emails_status_send_idx" ON "scheduled_emails" USING btree ("status","send_at");
--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD COLUMN IF NOT EXISTS "note" text;
--> statement-breakpoint
ALTER TABLE "entitlement_grants" DROP CONSTRAINT "entitlement_grants_source_ck";
--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_source_ck" CHECK ("entitlement_grants"."source_kind" IN ('trial_m1_nocard', 'trial_tipster_5d', 'referral_host_15d', 'referral_friend_15d', 'ambassador_bonus_30d', 'tipster_comp_pass', 'admin_grant', 'transfer_payment', 'coupon'));
--> statement-breakpoint
ALTER TABLE "tipster_commission_ledger" ADD COLUMN IF NOT EXISTS "payout_note" text;
--> statement-breakpoint
CREATE TABLE "transfer_payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_interval" text NOT NULL,
	"amount_centavos_mxn" integer NOT NULL,
	"reported_amount_centavos_mxn" integer,
	"amount_mismatch" boolean DEFAULT false NOT NULL,
	"referral_discount_applied" boolean DEFAULT false NOT NULL,
	"reference_code" text NOT NULL,
	"origin_bank" text,
	"receipt_reference" text,
	"payer_name" text,
	"transfer_date" text,
	"user_note" text,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"entitlement_grant_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_payment_requests_reference_code_unique" UNIQUE("reference_code"),
	CONSTRAINT "transfer_requests_interval_ck" CHECK ("transfer_payment_requests"."plan_interval" IN ('monthly', 'annual')),
	CONSTRAINT "transfer_requests_amount_ck" CHECK ("transfer_payment_requests"."amount_centavos_mxn" > 0),
	CONSTRAINT "transfer_requests_reported_amount_ck" CHECK ("transfer_payment_requests"."reported_amount_centavos_mxn" IS NULL OR "transfer_payment_requests"."reported_amount_centavos_mxn" > 0),
	CONSTRAINT "transfer_requests_status_ck" CHECK ("transfer_payment_requests"."status" IN ('pending_review', 'approved', 'rejected', 'canceled'))
);
--> statement-breakpoint
ALTER TABLE "transfer_payment_requests" ADD CONSTRAINT "transfer_payment_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer_payment_requests" ADD CONSTRAINT "transfer_payment_requests_entitlement_grant_id_entitlement_grants_id_fk" FOREIGN KEY ("entitlement_grant_id") REFERENCES "public"."entitlement_grants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer_payment_requests" ADD CONSTRAINT "transfer_payment_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "transfer_requests_user_created_idx" ON "transfer_payment_requests" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "transfer_requests_status_created_idx" ON "transfer_payment_requests" USING btree ("status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_requests_one_pending_per_user_uq" ON "transfer_payment_requests" USING btree ("user_id") WHERE status = 'pending_review';
--> statement-breakpoint
CREATE TABLE "access_coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"days" integer NOT NULL,
	"max_redemptions" integer,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "access_coupons_code_upper_ck" CHECK ("access_coupons"."code" = upper("access_coupons"."code")),
	CONSTRAINT "access_coupons_days_ck" CHECK ("access_coupons"."days" BETWEEN 1 AND 365),
	CONSTRAINT "access_coupons_max_redemptions_ck" CHECK ("access_coupons"."max_redemptions" IS NULL OR "access_coupons"."max_redemptions" > 0),
	CONSTRAINT "access_coupons_redeemed_count_ck" CHECK ("access_coupons"."redeemed_count" >= 0),
	CONSTRAINT "access_coupons_quota_ck" CHECK ("access_coupons"."max_redemptions" IS NULL OR "access_coupons"."redeemed_count" <= "access_coupons"."max_redemptions")
);
--> statement-breakpoint
ALTER TABLE "access_coupons" ADD CONSTRAINT "access_coupons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entitlement_grant_id" uuid,
	"transfer_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_access_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."access_coupons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_entitlement_grant_id_entitlement_grants_id_fk" FOREIGN KEY ("entitlement_grant_id") REFERENCES "public"."entitlement_grants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_transfer_request_id_transfer_payment_requests_id_fk" FOREIGN KEY ("transfer_request_id") REFERENCES "public"."transfer_payment_requests"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_coupon_user_uq" ON "coupon_redemptions" USING btree ("coupon_id","user_id");
--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_created_idx" ON "coupon_redemptions" USING btree ("user_id","created_at");
