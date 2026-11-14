-- COBRO-SPEI-2: referencia SPEI única ligada a la cuenta del socio y cupón de un solo uso con vigencia al confirmar pago.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "spei_reference_code" text;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_spei_reference_code_unique" UNIQUE("spei_reference_code");
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_spei_reference_code_ck" CHECK ("users"."spei_reference_code" IS NULL OR ("users"."spei_reference_code" = upper("users"."spei_reference_code") AND char_length("users"."spei_reference_code") BETWEEN 8 AND 40));
--> statement-breakpoint
ALTER TABLE "transfer_payment_requests" DROP CONSTRAINT IF EXISTS "transfer_payment_requests_reference_code_unique";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transfer_requests_reference_code_idx" ON "transfer_payment_requests" USING btree ("reference_code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transfer_requests_pending_ref_uq" ON "transfer_payment_requests" USING btree ("reference_code") WHERE status = 'pending_review';
--> statement-breakpoint
ALTER TABLE "access_coupons" ADD COLUMN IF NOT EXISTS "transfer_request_id" uuid;
--> statement-breakpoint
ALTER TABLE "access_coupons" ADD COLUMN IF NOT EXISTS "restricted_to_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "access_coupons" ADD CONSTRAINT "access_coupons_transfer_request_id_unique" UNIQUE("transfer_request_id");
--> statement-breakpoint
ALTER TABLE "access_coupons" ADD CONSTRAINT "access_coupons_transfer_request_id_fk" FOREIGN KEY ("transfer_request_id") REFERENCES "public"."transfer_payment_requests"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_coupons" ADD CONSTRAINT "access_coupons_restricted_to_user_id_fk" FOREIGN KEY ("restricted_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer_payment_requests" ADD COLUMN IF NOT EXISTS "issued_coupon_id" uuid;
--> statement-breakpoint
ALTER TABLE "transfer_payment_requests" ADD CONSTRAINT "transfer_payment_requests_issued_coupon_id_fk" FOREIGN KEY ("issued_coupon_id") REFERENCES "public"."access_coupons"("id") ON DELETE set null ON UPDATE no action;
