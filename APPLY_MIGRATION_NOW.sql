-- =====================================================
-- URGENT: Apply migration manually in Supabase SQL Editor
-- Run this ENTIRE script in one go
-- =====================================================

-- SGE PRICES: Add metadata columns
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS exchange TEXT DEFAULT 'SGE';
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS contract TEXT DEFAULT 'Ag99.99';
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CNY';
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS fx_source TEXT DEFAULT 'ECB';
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN DEFAULT FALSE;
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS conversion_steps TEXT;
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS raw_data TEXT;

-- RETAIL PRICES: Add discovery tracking
ALTER TABLE retail_prices ADD COLUMN IF NOT EXISTS discovery_strategy TEXT;
ALTER TABLE retail_prices ADD COLUMN IF NOT EXISTS attempted_urls TEXT;
ALTER TABLE retail_prices ADD COLUMN IF NOT EXISTS http_status_code INTEGER;

-- Backfill existing SGE data
UPDATE sge_prices 
SET 
  exchange = 'SGE',
  contract = 'Ag99.99',
  currency = 'CNY',
  fx_source = 'ECB',
  provider = 'Unknown (Legacy)',
  is_estimated = FALSE
WHERE provider IS NULL;

-- Backfill existing retail data
UPDATE retail_prices
SET
  discovery_strategy = 'legacy-direct',
  attempted_urls = '[]'::text,
  http_status_code = CASE 
    WHEN verification_status = 'VERIFIED' THEN 200
    WHEN verification_status = 'FAILED' THEN 404
    ELSE NULL
  END
WHERE discovery_strategy IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sge_prices_provider ON sge_prices(provider);
CREATE INDEX IF NOT EXISTS idx_sge_prices_estimated ON sge_prices(is_estimated);
CREATE INDEX IF NOT EXISTS idx_retail_prices_discovery ON retail_prices(discovery_strategy);
CREATE INDEX IF NOT EXISTS idx_retail_prices_http_status ON retail_prices(http_status_code);

-- Verify (should show columns exist)
SELECT 
  'SGE columns' as check_name,
  column_name
FROM information_schema.columns
WHERE table_name = 'sge_prices'
  AND column_name IN ('exchange', 'contract', 'currency', 'provider', 'is_estimated')
ORDER BY column_name;

SELECT 
  'Retail columns' as check_name,
  column_name
FROM information_schema.columns
WHERE table_name = 'retail_prices'
  AND column_name IN ('discovery_strategy', 'attempted_urls', 'http_status_code')
ORDER BY column_name;
