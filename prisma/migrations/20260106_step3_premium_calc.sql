-- STEP 3: Add premium calculation columns
-- Run this AFTER step 2

ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS fine_oz DOUBLE PRECISION DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS implied_usd_oz DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS premium_percent DOUBLE PRECISION;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'retail_prices' 
  AND column_name IN ('fine_oz', 'implied_usd_oz', 'premium_percent');
