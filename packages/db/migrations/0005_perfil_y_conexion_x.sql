ALTER TABLE "users" ADD COLUMN "bio" varchar(160);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "x_username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "x_linked_at" timestamp with time zone;