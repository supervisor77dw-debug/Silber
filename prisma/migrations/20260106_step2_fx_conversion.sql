-- STEP 2: Add FX conversion columns
-- Run this AFTER step 1

ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS price_usd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS fx_rate DOUBLE PRECISION;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'retail_prices' 
  AND column_name IN ('price_usd', 'currency', 'fx_rate');
