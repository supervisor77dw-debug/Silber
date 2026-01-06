-- ========================================
-- ATOMIC MIGRATION (no verify query)
-- ========================================
-- Removes SELECT at end to avoid timeout from lock queue
-- ========================================

ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS raw_excerpt TEXT;

-- Done! Check columns manually in Supabase Table Editor
