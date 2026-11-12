CREATE TABLE "cfdi_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"stripe_invoice_id" text,
	"invoice_kind" text NOT NULL,
	"facturapi_invoice_id" text NOT NULL,
	"sat_uuid" uuid NOT NULL,
	"total_centavos_mxn" integer NOT NULL,
	"vat_centavos_mxn" integer NOT NULL,
	"status" text NOT NULL,
	"xml_storage_key" text NOT NULL,
	"pdf_storage_key" text NOT NULL,
	"stamped_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cfdi_invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "cfdi_invoices_facturapi_invoice_id_unique" UNIQUE("facturapi_invoice_id"),
	CONSTRAINT "cfdi_invoices_sat_uuid_unique" UNIQUE("sat_uuid"),
	CONSTRAINT "cfdi_invoices_kind_ck" CHECK ("cfdi_invoices"."invoice_kind" IN ('individual_auto', 'individual_self_service', 'global_monthly', 'egreso_refund')),
	CONSTRAINT "cfdi_invoices_status_ck" CHECK ("cfdi_invoices"."status" IN ('valid', 'cancellation_pending', 'canceled')),
	CONSTRAINT "cfdi_invoices_global_ck" CHECK (("cfdi_invoices"."invoice_kind" = 'global_monthly') = ("cfdi_invoices"."user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "cfdi_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"rfc" varchar(13) NOT NULL,
	"legal_name" text NOT NULL,
	"tax_zip_code" char(5) NOT NULL,
	"sat_tax_system" char(3) NOT NULL,
	"cfdi_use" char(3) DEFAULT 'G03' NOT NULL,
	"billing_email" text NOT NULL,
	"facturapi_customer_id" text,
	"auto_invoice_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cfdi_profiles_facturapi_customer_id_unique" UNIQUE("facturapi_customer_id"),
	CONSTRAINT "cfdi_profiles_system_ck" CHECK ("cfdi_profiles"."sat_tax_system" IN ('601', '605', '612', '616', '626')),
	CONSTRAINT "cfdi_profiles_rfc_ck" CHECK (char_length("cfdi_profiles"."rfc") IN (12, 13)),
	CONSTRAINT "cfdi_profiles_zip_ck" CHECK ("cfdi_profiles"."tax_zip_code" ~ '^[0-9]{5}$')
);
--> statement-breakpoint
CREATE TABLE "entitlement_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"days_granted" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"applied_to_stripe_sub_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_grants_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "entitlement_grants_source_ck" CHECK ("entitlement_grants"."source_kind" IN ('trial_m1_nocard', 'trial_tipstar_5d', 'referral_host_15d', 'referral_friend_15d', 'ambassador_bonus_30d', 'tipstar_comp_pass', 'admin_grant')),
	CONSTRAINT "entitlement_grants_days_ck" CHECK ("entitlement_grants"."days_granted" > 0),
	CONSTRAINT "entitlement_grants_range_ck" CHECK ("entitlement_grants"."ends_at" > "entitlement_grants"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "platform_runtime_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"bool_value" boolean DEFAULT true NOT NULL,
	"json_value" jsonb,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_weekly_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipstar_user_id" uuid NOT NULL,
	"iso_year_week" char(8) NOT NULL,
	"public_slug" text NOT NULL,
	"origin_type" text NOT NULL,
	"game_id" text NOT NULL,
	"unlocked_pick_id" text NOT NULL,
	"sealed_journal_entry_id" uuid,
	"thesis_copy" varchar(240) NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"signup_clicks_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"game_kickoff_at" timestamp with time zone NOT NULL,
	CONSTRAINT "public_weekly_origin_ck" CHECK ("public_weekly_picks"."origin_type" IN ('spacetime', 'bitacora')),
	CONSTRAINT "public_weekly_bitacora_seal_ck" CHECK ("public_weekly_picks"."origin_type" <> 'bitacora' OR "public_weekly_picks"."sealed_journal_entry_id" IS NOT NULL),
	CONSTRAINT "public_weekly_before_kickoff_ck" CHECK ("public_weekly_picks"."published_at" < "public_weekly_picks"."game_kickoff_at")
);
--> statement-breakpoint
CREATE TABLE "referral_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"referral_code_used" text NOT NULL,
	"status" text NOT NULL,
	"friend_discount_coupon_id" text,
	"qualifying_stripe_invoice_id" text,
	"qualifying_paid_centavos_mxn" integer,
	"referrer_grant_id" uuid,
	"referred_grant_id" uuid,
	"triggered_ambassador_bonus_grant_id" uuid,
	"qualified_at" timestamp with time zone,
	"rewarded_at" timestamp with time zone,
	"clawed_back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_grants_referred_user_id_unique" UNIQUE("referred_user_id"),
	CONSTRAINT "referral_grants_qualifying_stripe_invoice_id_unique" UNIQUE("qualifying_stripe_invoice_id"),
	CONSTRAINT "referral_grants_self_ck" CHECK ("referral_grants"."referrer_user_id" <> "referral_grants"."referred_user_id"),
	CONSTRAINT "referral_grants_status_ck" CHECK ("referral_grants"."status" IN ('trial_started', 'qualified_paid', 'rewarded_bilateral', 'rejected_fraud', 'clawed_back')),
	CONSTRAINT "referral_grants_paid_ck" CHECK ("referral_grants"."qualifying_paid_centavos_mxn" IS NULL OR "referral_grants"."qualifying_paid_centavos_mxn" >= 15000)
);
--> statement-breakpoint
CREATE TABLE "sealed_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pick_id" text NOT NULL,
	"game_id" text NOT NULL,
	"league_label" text NOT NULL,
	"match_label" text NOT NULL,
	"pick_label" text NOT NULL,
	"origin" text NOT NULL,
	"units" numeric(5, 2) NOT NULL,
	"user_decimal" numeric(7, 3) NOT NULL,
	"fair_decimal" numeric(7, 3) NOT NULL,
	"clv_pct" numeric(6, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"note" varchar(280),
	"seal_hash" char(64) NOT NULL,
	"sealed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "sealed_picks_status_ck" CHECK ("sealed_picks"."status" IN ('pending', 'won', 'lost', 'void')),
	CONSTRAINT "sealed_picks_units_ck" CHECK ("sealed_picks"."units" > 0 AND "sealed_picks"."units" <= 5),
	CONSTRAINT "sealed_picks_before_kickoff_ck" CHECK ("sealed_picks"."sealed_at" < "sealed_picks"."kickoff_at")
);
--> statement-breakpoint
CREATE TABLE "social_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" varchar(400) NOT NULL,
	"author_record_snapshot" text NOT NULL,
	"is_hidden_by_moderation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_moderation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"league_label" text NOT NULL,
	"match_label" text NOT NULL,
	"origin_type" text NOT NULL,
	"pick_badge" text NOT NULL,
	"sealed_journal_entry_id" uuid,
	"author_role_badge_snapshot" text NOT NULL,
	"author_record_snapshot" text NOT NULL,
	"author_clv_snapshot" text NOT NULL,
	"body" varchar(600) NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"copies_to_journal_count" integer DEFAULT 0 NOT NULL,
	"is_hidden_by_moderation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_posts_origin_ck" CHECK ("social_posts"."origin_type" IN ('Spacetime Suite', 'Bitácora Propia'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"provider_subscription_id" text,
	"plan_interval" text NOT NULL,
	"status" text NOT NULL,
	"price_centavos_mxn" integer NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"grace_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id"),
	CONSTRAINT "subscriptions_provider_ck" CHECK ("subscriptions"."provider" IN ('stripe', 'mercadopago', 'manual')),
	CONSTRAINT "subscriptions_interval_ck" CHECK ("subscriptions"."plan_interval" IN ('monthly', 'annual')),
	CONSTRAINT "subscriptions_status_ck" CHECK ("subscriptions"."status" IN ('trialing_no_card', 'trialing_card', 'active', 'past_due_grace', 'canceled', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "tipstar_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipstar_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"promo_code_used" text NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"landing_slug" text,
	"status" text NOT NULL,
	"first_paid_at" timestamp with time zone,
	"last_paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipstar_attributions_referred_user_id_unique" UNIQUE("referred_user_id"),
	CONSTRAINT "tipstar_attr_self_ck" CHECK ("tipstar_attributions"."tipstar_user_id" <> "tipstar_attributions"."referred_user_id"),
	CONSTRAINT "tipstar_attr_status_ck" CHECK ("tipstar_attributions"."status" IN ('trial_5d', 'active_paying', 'churned', 'fraud_blocked'))
);
--> statement-breakpoint
CREATE TABLE "tipstar_commission_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attribution_id" uuid NOT NULL,
	"tipstar_user_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"gross_paid_centavos_mxn" integer NOT NULL,
	"vat_centavos_mxn" integer NOT NULL,
	"gateway_fee_centavos_mxn" integer NOT NULL,
	"net_commissionable_centavos_mxn" integer NOT NULL,
	"commission_bps" integer NOT NULL,
	"commission_centavos_mxn" integer NOT NULL,
	"status" text NOT NULL,
	"clears_at" timestamp with time zone NOT NULL,
	"payout_batch_id" uuid,
	"paid_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipstar_commission_ledger_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "tipstar_ledger_status_ck" CHECK ("tipstar_commission_ledger"."status" IN ('pending_clearance', 'payable', 'paid_out', 'reversed_refund')),
	CONSTRAINT "tipstar_ledger_net_ck" CHECK ("tipstar_commission_ledger"."net_commissionable_centavos_mxn" = "tipstar_commission_ledger"."gross_paid_centavos_mxn" - "tipstar_commission_ledger"."vat_centavos_mxn" - "tipstar_commission_ledger"."gateway_fee_centavos_mxn")
);
--> statement-breakpoint
CREATE TABLE "tipstar_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"specialty" text NOT NULL,
	"promo_code" text NOT NULL,
	"stripe_promotion_code_id" text,
	"free_trial_days" integer DEFAULT 5 NOT NULL,
	"commission_bps" integer DEFAULT 2500 NOT NULL,
	"default_weekly_slug" text NOT NULL,
	"payout_method" text DEFAULT 'spei_manual' NOT NULL,
	"stripe_connect_account_id" text,
	"clabe_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipstar_profiles_handle_unique" UNIQUE("handle"),
	CONSTRAINT "tipstar_profiles_promo_code_unique" UNIQUE("promo_code"),
	CONSTRAINT "tipstar_profiles_stripe_promotion_code_id_unique" UNIQUE("stripe_promotion_code_id"),
	CONSTRAINT "tipstar_profiles_default_weekly_slug_unique" UNIQUE("default_weekly_slug"),
	CONSTRAINT "tipstar_profiles_payout_ck" CHECK ("tipstar_profiles"."payout_method" IN ('spei_manual', 'stripe_connect')),
	CONSTRAINT "tipstar_profiles_bps_ck" CHECK ("tipstar_profiles"."commission_bps" BETWEEN 0 AND 5000),
	CONSTRAINT "tipstar_profiles_code_upper_ck" CHECK ("tipstar_profiles"."promo_code" = upper("tipstar_profiles"."promo_code"))
);
--> statement-breakpoint
CREATE TABLE "trial_fingerprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"canonical_email" text NOT NULL,
	"canonical_email_sha256" char(64) NOT NULL,
	"oauth_provider" text,
	"oauth_subject" text,
	"device_fp_hash" char(64) NOT NULL,
	"ip_subnet_hash" char(64) NOT NULL,
	"turnstile_ray_id" text,
	"stripe_card_fingerprint" text,
	"trial_phase" text NOT NULL,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_fingerprints_canonical_email_sha256_unique" UNIQUE("canonical_email_sha256"),
	CONSTRAINT "trial_fp_provider_ck" CHECK ("trial_fingerprints"."oauth_provider" IS NULL OR "trial_fingerprints"."oauth_provider" IN ('google', 'apple', 'email')),
	CONSTRAINT "trial_fp_phase_ck" CHECK ("trial_fingerprints"."trial_phase" IN ('month1_no_card', 'month2_setup_intent')),
	CONSTRAINT "trial_fp_decision_ck" CHECK ("trial_fingerprints"."decision" IN ('granted', 'denied_duplicate_email', 'denied_duplicate_device', 'denied_duplicate_card', 'denied_subnet_rate'))
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"odds_format" text DEFAULT 'american' NOT NULL,
	"risk_preference" text DEFAULT 'medio' NOT NULL,
	"favorite_leagues" text[] DEFAULT '{}'::text[] NOT NULL,
	"unit_mxn_centavos" integer DEFAULT 10000 NOT NULL,
	"public_record_visible" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_odds_ck" CHECK ("user_preferences"."odds_format" IN ('american', 'decimal')),
	CONSTRAINT "user_preferences_risk_ck" CHECK ("user_preferences"."risk_preference" IN ('conservador', 'medio', 'arriesgado'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"handle" text,
	"referral_code" text,
	"is_ambassador" boolean DEFAULT false NOT NULL,
	"is_adult" boolean DEFAULT false NOT NULL,
	"social_pause_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_user_id_game_id_pk" PRIMARY KEY("user_id","game_id")
);
--> statement-breakpoint
ALTER TABLE "cfdi_invoices" ADD CONSTRAINT "cfdi_invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cfdi_profiles" ADD CONSTRAINT "cfdi_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_runtime_flags" ADD CONSTRAINT "platform_runtime_flags_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_weekly_picks" ADD CONSTRAINT "public_weekly_picks_tipstar_user_id_tipstar_profiles_user_id_fk" FOREIGN KEY ("tipstar_user_id") REFERENCES "public"."tipstar_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_weekly_picks" ADD CONSTRAINT "public_weekly_picks_sealed_journal_entry_id_sealed_picks_id_fk" FOREIGN KEY ("sealed_journal_entry_id") REFERENCES "public"."sealed_picks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_grants" ADD CONSTRAINT "referral_grants_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_grants" ADD CONSTRAINT "referral_grants_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_grants" ADD CONSTRAINT "referral_grants_referrer_grant_id_entitlement_grants_id_fk" FOREIGN KEY ("referrer_grant_id") REFERENCES "public"."entitlement_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_grants" ADD CONSTRAINT "referral_grants_referred_grant_id_entitlement_grants_id_fk" FOREIGN KEY ("referred_grant_id") REFERENCES "public"."entitlement_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_grants" ADD CONSTRAINT "referral_grants_triggered_ambassador_bonus_grant_id_entitlement_grants_id_fk" FOREIGN KEY ("triggered_ambassador_bonus_grant_id") REFERENCES "public"."entitlement_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed_picks" ADD CONSTRAINT "sealed_picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_moderation_logs" ADD CONSTRAINT "social_moderation_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_sealed_journal_entry_id_sealed_picks_id_fk" FOREIGN KEY ("sealed_journal_entry_id") REFERENCES "public"."sealed_picks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipstar_attributions" ADD CONSTRAINT "tipstar_attributions_tipstar_user_id_tipstar_profiles_user_id_fk" FOREIGN KEY ("tipstar_user_id") REFERENCES "public"."tipstar_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipstar_attributions" ADD CONSTRAINT "tipstar_attributions_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipstar_commission_ledger" ADD CONSTRAINT "tipstar_commission_ledger_attribution_id_tipstar_attributions_id_fk" FOREIGN KEY ("attribution_id") REFERENCES "public"."tipstar_attributions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipstar_commission_ledger" ADD CONSTRAINT "tipstar_commission_ledger_tipstar_user_id_tipstar_profiles_user_id_fk" FOREIGN KEY ("tipstar_user_id") REFERENCES "public"."tipstar_profiles"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipstar_profiles" ADD CONSTRAINT "tipstar_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_fingerprints" ADD CONSTRAINT "trial_fingerprints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cfdi_invoices_user_idx" ON "cfdi_invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entitlement_grants_user_ends_idx" ON "entitlement_grants" USING btree ("user_id","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_weekly_one_per_week_uq" ON "public_weekly_picks" USING btree ("tipstar_user_id","iso_year_week");--> statement-breakpoint
CREATE INDEX "public_weekly_slug_idx" ON "public_weekly_picks" USING btree ("public_slug");--> statement-breakpoint
CREATE INDEX "public_weekly_game_idx" ON "public_weekly_picks" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "referral_grants_referrer_idx" ON "referral_grants" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "sealed_picks_user_idx" ON "sealed_picks" USING btree ("user_id","sealed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sealed_picks_user_pick_uq" ON "sealed_picks" USING btree ("user_id","pick_id");--> statement-breakpoint
CREATE INDEX "social_comments_post_idx" ON "social_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "social_posts_author_idx" ON "social_posts" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "social_posts_game_idx" ON "social_posts" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "social_posts_created_idx" ON "social_posts" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("provider_customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_period_end_idx" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "tipstar_attr_tipstar_idx" ON "tipstar_attributions" USING btree ("tipstar_user_id");--> statement-breakpoint
CREATE INDEX "tipstar_ledger_attr_idx" ON "tipstar_commission_ledger" USING btree ("attribution_id");--> statement-breakpoint
CREATE INDEX "tipstar_ledger_tipstar_idx" ON "tipstar_commission_ledger" USING btree ("tipstar_user_id");--> statement-breakpoint
CREATE INDEX "trial_fp_oauth_idx" ON "trial_fingerprints" USING btree ("oauth_provider","oauth_subject");--> statement-breakpoint
CREATE INDEX "trial_fp_device_idx" ON "trial_fingerprints" USING btree ("device_fp_hash");--> statement-breakpoint
CREATE INDEX "trial_fp_subnet_idx" ON "trial_fingerprints" USING btree ("ip_subnet_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_fp_card_uq" ON "trial_fingerprints" USING btree ("stripe_card_fingerprint") WHERE "trial_fingerprints"."stripe_card_fingerprint" IS NOT NULL;