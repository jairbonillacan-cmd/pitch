CREATE TABLE "social_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_reports_target_ck" CHECK (("social_reports"."post_id" IS NOT NULL AND "social_reports"."comment_id" IS NULL) OR ("social_reports"."post_id" IS NULL AND "social_reports"."comment_id" IS NOT NULL)),
	CONSTRAINT "social_reports_reason_ck" CHECK ("social_reports"."reason" IN ('spam_enlaces', 'ofensivo', 'apuesta_riesgosa', 'otro')),
	CONSTRAINT "social_reports_status_ck" CHECK ("social_reports"."status" IN ('pending', 'hidden', 'restored', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_comment_id_social_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."social_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_reports_status_created_idx" ON "social_reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "social_reports_reporter_created_idx" ON "social_reports" USING btree ("reporter_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "social_reports_reporter_post_uidx" ON "social_reports" USING btree ("reporter_user_id","post_id") WHERE "social_reports"."post_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "social_reports_reporter_comment_uidx" ON "social_reports" USING btree ("reporter_user_id","comment_id") WHERE "social_reports"."comment_id" IS NOT NULL;