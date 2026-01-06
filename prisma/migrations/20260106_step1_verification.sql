-- STEP 1: Add verification columns ONLY
-- Run this FIRST if full migration times out

ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS raw_excerpt TEXT;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'retail_prices' 
  AND column_name IN ('verification_status', 'raw_excerpt');
