ALTER TABLE "tipstar_commission_ledger" ADD COLUMN "claim_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tipstar_commission_ledger" DROP CONSTRAINT "tipstar_ledger_status_ck";--> statement-breakpoint
ALTER TABLE "tipstar_commission_ledger" ADD CONSTRAINT "tipstar_ledger_status_ck" CHECK ("tipstar_commission_ledger"."status" IN ('pending_clearance', 'payable', 'processing_payout', 'paid_out', 'reversed_refund'));
