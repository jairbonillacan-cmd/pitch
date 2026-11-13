-- Renombra «tipstar» a «tipster» en tablas, columnas, restricciones, índices y valores guardados.
ALTER TABLE "tipstar_profiles" RENAME TO "tipster_profiles";
--> statement-breakpoint
ALTER TABLE "tipstar_attributions" RENAME TO "tipster_attributions";
--> statement-breakpoint
ALTER TABLE "tipstar_commission_ledger" RENAME TO "tipster_commission_ledger";
--> statement-breakpoint
ALTER TABLE "public_weekly_picks" RENAME COLUMN "tipstar_user_id" TO "tipster_user_id";
--> statement-breakpoint
ALTER TABLE "tipster_attributions" RENAME COLUMN "tipstar_user_id" TO "tipster_user_id";
--> statement-breakpoint
ALTER TABLE "tipster_commission_ledger" RENAME COLUMN "tipstar_user_id" TO "tipster_user_id";
--> statement-breakpoint
ALTER TABLE "tipster_attributions" RENAME CONSTRAINT "tipstar_attr_self_ck" TO "tipster_attr_self_ck";
--> statement-breakpoint
ALTER TABLE "tipster_attributions" RENAME CONSTRAINT "tipstar_attr_status_ck" TO "tipster_attr_status_ck";
--> statement-breakpoint
ALTER TABLE "tipster_attributions" RENAME CONSTRAINT "tipstar_attributions_pkey" TO "tipster_attributions_pkey";
--> statement-breakpoint
ALTER TABLE "tipster_attributions" RENAME CONSTRAINT "tipstar_attributions_referred_user_id_unique" TO "tipster_attributions_referred_user_id_unique";
--> statement-breakpoint
ALTER TABLE "tipster_attributions" RENAME CONSTRAINT "tipstar_attributions_tipstar_user_id_tipstar_profiles_user_id_f" TO "tipster_attributions_tipster_user_id_tipster_profiles_user_id_f";
--> statement-breakpoint
ALTER TABLE "tipster_attributions" RENAME CONSTRAINT "tipstar_attributions_referred_user_id_users_id_fk" TO "tipster_attributions_referred_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tipster_commission_ledger" RENAME CONSTRAINT "tipstar_ledger_net_ck" TO "tipster_ledger_net_ck";
--> statement-breakpoint
ALTER TABLE "tipster_commission_ledger" RENAME CONSTRAINT "tipstar_commission_ledger_pkey" TO "tipster_commission_ledger_pkey";
--> statement-breakpoint
ALTER TABLE "tipster_commission_ledger" RENAME CONSTRAINT "tipstar_commission_ledger_stripe_invoice_id_unique" TO "tipster_commission_ledger_stripe_invoice_id_unique";
--> statement-breakpoint
ALTER TABLE "tipster_commission_ledger" RENAME CONSTRAINT "tipstar_commission_ledger_attribution_id_tipstar_attributions_i" TO "tipster_commission_ledger_attribution_id_tipster_attributions_i";
--> statement-breakpoint
ALTER TABLE "tipster_commission_ledger" RENAME CONSTRAINT "tipstar_commission_ledger_tipstar_user_id_tipstar_profiles_user" TO "tipster_commission_ledger_tipster_user_id_tipster_profiles_user";
--> statement-breakpoint
ALTER TABLE "tipster_commission_ledger" RENAME CONSTRAINT "tipstar_commission_ledger_stripe_transfer_id_unique" TO "tipster_commission_ledger_stripe_transfer_id_unique";
--> statement-breakpoint
ALTER TABLE "tipster_commission_ledger" RENAME CONSTRAINT "tipstar_ledger_status_ck" TO "tipster_ledger_status_ck";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_payout_ck" TO "tipster_profiles_payout_ck";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_bps_ck" TO "tipster_profiles_bps_ck";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_code_upper_ck" TO "tipster_profiles_code_upper_ck";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_pkey" TO "tipster_profiles_pkey";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_handle_unique" TO "tipster_profiles_handle_unique";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_promo_code_unique" TO "tipster_profiles_promo_code_unique";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_stripe_promotion_code_id_unique" TO "tipster_profiles_stripe_promotion_code_id_unique";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_default_weekly_slug_unique" TO "tipster_profiles_default_weekly_slug_unique";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_user_id_users_id_fk" TO "tipster_profiles_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tipster_profiles" RENAME CONSTRAINT "tipstar_profiles_stripe_connect_account_id_unique" TO "tipster_profiles_stripe_connect_account_id_unique";
--> statement-breakpoint
ALTER TABLE "public_weekly_picks" RENAME CONSTRAINT "public_weekly_picks_tipstar_user_id_tipstar_profiles_user_id_fk" TO "public_weekly_picks_tipster_user_id_tipster_profiles_user_id_fk";
--> statement-breakpoint
ALTER INDEX "tipstar_attr_tipstar_idx" RENAME TO "tipster_attr_tipster_idx";
--> statement-breakpoint
ALTER INDEX "tipstar_ledger_attr_idx" RENAME TO "tipster_ledger_attr_idx";
--> statement-breakpoint
ALTER INDEX "tipstar_ledger_tipstar_idx" RENAME TO "tipster_ledger_tipster_idx";
--> statement-breakpoint
ALTER TABLE "entitlement_grants" DROP CONSTRAINT "entitlement_grants_source_ck";
--> statement-breakpoint
UPDATE "entitlement_grants" SET "source_kind" = 'trial_tipster_5d' WHERE "source_kind" = 'trial_tipstar_5d';
--> statement-breakpoint
UPDATE "entitlement_grants" SET "source_kind" = 'tipster_comp_pass' WHERE "source_kind" = 'tipstar_comp_pass';
--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_source_ck" CHECK ("entitlement_grants"."source_kind" IN ('trial_m1_nocard', 'trial_tipster_5d', 'referral_host_15d', 'referral_friend_15d', 'ambassador_bonus_30d', 'tipster_comp_pass', 'admin_grant'));
--> statement-breakpoint
UPDATE "platform_runtime_flags" SET "key" = 'tipster_payouts_enabled' WHERE "key" = 'tipstar_payouts_enabled';
