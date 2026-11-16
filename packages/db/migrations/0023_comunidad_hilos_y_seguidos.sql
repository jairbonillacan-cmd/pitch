-- COMUNIDAD-3: hilos de respuesta, reacciones "Útil" en comentarios, avisos de respuesta/mención
-- y temas seguidos persistidos en user_preferences.
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "followed_topics" jsonb DEFAULT '{"leagues":[],"teams":[]}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "social_comments" ADD COLUMN IF NOT EXISTS "parent_comment_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_parent_comment_id_social_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."social_comments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_comments_parent_idx" ON "social_comments" USING btree ("parent_comment_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_comment_likes" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_comment_likes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_comment_likes" ADD CONSTRAINT "social_comment_likes_comment_id_social_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."social_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_comment_likes" ADD CONSTRAINT "social_comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_comment_likes_user_idx" ON "social_comment_likes" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "comment_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_social_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."social_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_kind_ck";
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_ck" CHECK ("notifications"."kind" IN ('comment', 'comment_reply', 'mention', 'follow', 'like'));
