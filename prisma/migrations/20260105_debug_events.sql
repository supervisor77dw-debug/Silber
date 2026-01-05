-- Add debug_events table for comprehensive logging
CREATE TABLE IF NOT EXISTS debug_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope TEXT NOT NULL,  -- 'refresh', 'backfill', 'ui', 'api'
  source TEXT NOT NULL, -- 'fx', 'sge', 'comex', 'retail', 'metal', 'db'
  level TEXT NOT NULL,  -- 'info', 'warn', 'error'
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debug_events_ts ON debug_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_debug_events_scope_source ON debug_events(scope, source);
CREATE INDEX IF NOT EXISTS idx_debug_events_level ON debug_events(level);
