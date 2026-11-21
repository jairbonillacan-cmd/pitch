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
      IF NEW.status IS DISTINCT FROM 'pending'
         OR NEW.settled_at IS NOT NULL
         OR NEW.closing_decimal IS NOT NULL
         OR NEW.clv_pct IS NOT NULL
         OR NEW.parlay_leg_results IS NOT NULL
      THEN
        RAISE EXCEPTION 'sealed_picks_immutable: PRE_SETTLED_INSERT_FORBIDDEN' USING ERRCODE = '55000';
      END IF;
      IF NEW.sealed_at IS NULL
         OR ABS(EXTRACT(EPOCH FROM (clock_timestamp() - NEW.sealed_at))) > 5
      THEN
        NEW.sealed_at := clock_timestamp();
      END IF;
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
DROP TRIGGER IF EXISTS sealed_picks_immutability_trg ON sealed_picks;
--> statement-breakpoint
CREATE TRIGGER sealed_picks_immutability_trg
BEFORE INSERT OR UPDATE OR DELETE ON sealed_picks
FOR EACH ROW
EXECUTE FUNCTION enforce_sealed_picks_immutability();
