-- Migration: Add fetch_runs table for observability
-- Purpose: Track every data fetch attempt with status, counts, errors
-- Date: 2026-01-06

CREATE TABLE IF NOT EXISTS fetch_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'OK', 'PARTIAL', 'ERROR')),
  source TEXT NOT NULL CHECK (source IN ('metal', 'sge', 'fx', 'comex_stock', 'comex_price', 'retail', 'backfill')),
  
  -- Counts
  inserted INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  sample_url TEXT,
  
  -- Metadata
  triggered_by TEXT, -- 'cron', 'manual', 'ui'
  params JSONB -- e.g., {days: 30, sources: ['metal', 'sge']}
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_fetch_runs_source_started ON fetch_runs(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fetch_runs_status ON fetch_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fetch_runs_started ON fetch_runs(started_at DESC);

-- Verification
-- SELECT * FROM fetch_runs ORDER BY started_at DESC LIMIT 10;
