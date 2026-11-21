CREATE TABLE IF NOT EXISTS market_alerts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  league TEXT,
  market_family TEXT,
  selection TEXT,
  threshold_ev_pct DOUBLE PRECISION,
  min_decimal DOUBLE PRECISION,
  max_decimal DOUBLE PRECISION,
  direction TEXT,
  bookmaker TEXT,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  channel TEXT NOT NULL DEFAULT 'push',
  active BOOLEAN NOT NULL DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  last_fired_hash TEXT,
  fired_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT market_alerts_trigger_ck CHECK (trigger IN ('market_opened', 'sharp_steam', 'stale_line_ev', 'lineup_confirmed', 'schedule_change')),
  CONSTRAINT market_alerts_direction_ck CHECK (direction IS NULL OR direction IN ('any', 'over', 'under', 'home', 'away', 'draw')),
  CONSTRAINT market_alerts_cooldown_ck CHECK (cooldown_minutes BETWEEN 5 AND 1440),
  CONSTRAINT market_alerts_channel_ck CHECK (channel IN ('push', 'in_app', 'both')),
  CONSTRAINT market_alerts_fired_count_ck CHECK (fired_count >= 0),
  CONSTRAINT market_alerts_decimals_ck CHECK ((min_decimal IS NULL OR min_decimal > 1) AND (max_decimal IS NULL OR max_decimal > 1) AND (min_decimal IS NULL OR max_decimal IS NULL OR min_decimal <= max_decimal))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS market_alerts_user_active_created_idx ON market_alerts USING btree (user_id, active, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS market_alerts_trigger_active_idx ON market_alerts USING btree (trigger, active);
