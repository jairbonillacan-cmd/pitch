CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_key" text NOT NULL,
	"payload_json" jsonb,
	"ip_subnet_hash" char(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_idx" ON "admin_audit_logs" USING btree ("actor_user_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_sealed_pick_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "users" WHERE "id" = OLD."user_id") THEN
      RAISE EXCEPTION 'sealed_picks_immutable: no se permite eliminar picks sellados directamente';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."user_id" IS DISTINCT FROM NEW."user_id"
       OR OLD."pick_id" IS DISTINCT FROM NEW."pick_id"
       OR OLD."game_id" IS DISTINCT FROM NEW."game_id"
       OR OLD."league_label" IS DISTINCT FROM NEW."league_label"
       OR OLD."match_label" IS DISTINCT FROM NEW."match_label"
       OR OLD."pick_label" IS DISTINCT FROM NEW."pick_label"
       OR OLD."origin" IS DISTINCT FROM NEW."origin"
       OR OLD."units" IS DISTINCT FROM NEW."units"
       OR OLD."user_decimal" IS DISTINCT FROM NEW."user_decimal"
       OR OLD."fair_decimal" IS DISTINCT FROM NEW."fair_decimal"
       OR OLD."note" IS DISTINCT FROM NEW."note"
       OR OLD."seal_hash" IS DISTINCT FROM NEW."seal_hash"
       OR OLD."sealed_at" IS DISTINCT FROM NEW."sealed_at"
       OR OLD."kickoff_at" IS DISTINCT FROM NEW."kickoff_at"
    THEN
      RAISE EXCEPTION 'sealed_picks_immutable: los campos sellados no pueden modificarse';
    END IF;

    IF OLD."status" <> 'pending' AND (
       OLD."status" IS DISTINCT FROM NEW."status"
       OR OLD."settled_at" IS DISTINCT FROM NEW."settled_at"
       OR OLD."clv_pct" IS DISTINCT FROM NEW."clv_pct"
    ) THEN
      RAISE EXCEPTION 'sealed_picks_immutable: un pick ya calificado no puede volver a modificarse';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "pick_immutable"
BEFORE UPDATE OR DELETE ON "sealed_picks"
FOR EACH ROW
EXECUTE FUNCTION "enforce_sealed_pick_immutable"();
