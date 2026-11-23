CREATE UNLOGGED TABLE IF NOT EXISTS security_rate_buckets (
  bucket TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT security_rate_buckets_pk PRIMARY KEY (bucket, subject_key, window_start)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS security_rate_buckets_expires_idx ON security_rate_buckets USING btree (expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS security_abuse_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ip_hash TEXT NOT NULL,
  route TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT security_abuse_events_kind_ck CHECK (kind IN ('rate_limit', 'scraping_velocity', 'session_revoked', 'csrf_rejected', 'idor_attempt')),
  CONSTRAINT security_abuse_events_severity_ck CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS security_abuse_events_created_idx ON security_abuse_events USING btree (created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS security_abuse_events_user_created_idx ON security_abuse_events USING btree (user_id, created_at DESC);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_sealed_picks_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = OLD.user_id) THEN
      RAISE EXCEPTION 'sealed_picks_immutable: IMMUTABLE_SEALED_PICK_DELETE' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(current_setting('pitchlab.allow_historical_seed', true), '') <> 'on' THEN
      NEW.sealed_at := clock_timestamp();
      IF NEW.sealed_at >= NEW.kickoff_at THEN
        RAISE EXCEPTION 'sealed_picks_immutable: RETROACTIVE_SEALED_PICK_FORBIDDEN' USING ERRCODE = '55000';
      END IF;
    ELSE
      IF NEW.sealed_at IS NULL OR NEW.sealed_at >= NEW.kickoff_at THEN
        RAISE EXCEPTION 'sealed_picks_immutable: RETROACTIVE_SEALED_PICK_FORBIDDEN' USING ERRCODE = '55000';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'sealed_picks_immutable: IMMUTABLE_SETTLED_PICK_UPDATE' USING ERRCODE = '55000';
    END IF;

    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.pick_id IS DISTINCT FROM NEW.pick_id
       OR OLD.game_id IS DISTINCT FROM NEW.game_id
       OR OLD.league_label IS DISTINCT FROM NEW.league_label
       OR OLD.match_label IS DISTINCT FROM NEW.match_label
       OR OLD.pick_label IS DISTINCT FROM NEW.pick_label
       OR OLD.origin IS DISTINCT FROM NEW.origin
       OR OLD.units IS DISTINCT FROM NEW.units
       OR OLD.user_decimal IS DISTINCT FROM NEW.user_decimal
       OR OLD.fair_decimal IS DISTINCT FROM NEW.fair_decimal
       OR OLD.seal_hash IS DISTINCT FROM NEW.seal_hash
       OR OLD.sealed_at IS DISTINCT FROM NEW.sealed_at
       OR OLD.kickoff_at IS DISTINCT FROM NEW.kickoff_at
       OR OLD.pick_kind IS DISTINCT FROM NEW.pick_kind
       OR OLD.pick_market IS DISTINCT FROM NEW.pick_market
       OR OLD.pick_selection IS DISTINCT FROM NEW.pick_selection
       OR OLD.pick_line IS DISTINCT FROM NEW.pick_line
       OR OLD.parlay_legs IS DISTINCT FROM NEW.parlay_legs
    THEN
      RAISE EXCEPTION 'sealed_picks_immutable: IMMUTABLE_SEALED_PICK_UPDATE' USING ERRCODE = '55000';
    END IF;

    IF OLD.note IS DISTINCT FROM NEW.note THEN
      IF OLD.note IS NOT NULL OR NEW.note IS NULL THEN
        RAISE EXCEPTION 'sealed_picks_immutable: IMMUTABLE_SEALED_PICK_NOTE_UPDATE' USING ERRCODE = '55000';
      END IF;
    END IF;

    IF NEW.status NOT IN ('pending', 'won', 'lost', 'void') THEN
      RAISE EXCEPTION 'sealed_picks_immutable: INVALID_SEALED_PICK_STATUS' USING ERRCODE = '55000';
    END IF;

    IF NEW.status = 'pending' AND (
       OLD.settled_at IS DISTINCT FROM NEW.settled_at
       OR OLD.closing_decimal IS DISTINCT FROM NEW.closing_decimal
       OR OLD.clv_pct IS DISTINCT FROM NEW.clv_pct
    ) THEN
      RAISE EXCEPTION 'sealed_picks_immutable: IMMUTABLE_PENDING_SETTLEMENT_FIELDS' USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "pick_immutable" ON sealed_picks;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sealed_picks_immutability_trg ON sealed_picks;
--> statement-breakpoint
CREATE TRIGGER sealed_picks_immutability_trg
BEFORE INSERT OR UPDATE OR DELETE ON sealed_picks
FOR EACH ROW
EXECUTE FUNCTION enforce_sealed_picks_immutability();
--> statement-breakpoint
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS preferred_bookmakers TEXT[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS saved_views JSONB NOT NULL DEFAULT '[]'::jsonb;
