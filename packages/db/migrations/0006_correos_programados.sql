CREATE TABLE "scheduled_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider_id" text,
	"send_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_emails_status_ck" CHECK ("scheduled_emails"."status" IN ('pending', 'scheduled', 'sent', 'canceled', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "email_pick_results" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_emails_user_kind_uq" ON "scheduled_emails" USING btree ("user_id","kind");