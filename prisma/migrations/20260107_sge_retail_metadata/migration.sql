-- Migration: Add SGE metadata and retail discovery tracking
-- Date: 2026-01-07
-- Purpose: Transparency for SGE price sources and retail URL discovery debugging

-- =====================================================
-- SGE PRICES: Add provider metadata for transparency
-- =====================================================

-- Add exchange/contract identification
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS exchange TEXT DEFAULT 'SGE';
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS contract TEXT DEFAULT 'Ag99.99';
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CNY';

-- Add FX source tracking
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS fx_source TEXT DEFAULT 'ECB';

-- Add provider tracking
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN DEFAULT FALSE;

-- Add audit trail
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS conversion_steps TEXT; -- JSON array
ALTER TABLE sge_prices ADD COLUMN IF NOT EXISTS raw_data TEXT;         -- JSON object

-- =====================================================
-- RETAIL PRICES: Add discovery tracking for debugging
-- =====================================================

-- Add URL discovery metadata
ALTER TABLE retail_prices ADD COLUMN IF NOT EXISTS discovery_strategy TEXT;
ALTER TABLE retail_prices ADD COLUMN IF NOT EXISTS attempted_urls TEXT;      -- JSON array
ALTER TABLE retail_prices ADD COLUMN IF NOT EXISTS http_status_code INTEGER;

-- =====================================================
-- Backfill existing data with defaults
-- =====================================================

-- SGE: Mark all existing rows as "Unknown" provider
UPDATE sge_prices 
SET 
  exchange = 'SGE',
  contract = 'Ag99.99',
  currency = 'CNY',
  fx_source = 'ECB',
  provider = 'Unknown (Legacy)',
  is_estimated = FALSE
WHERE provider IS NULL;

-- Retail: Mark existing rows as 'direct-url' strategy
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

-- =====================================================
-- Create indexes for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_sge_prices_provider ON sge_prices(provider);
CREATE INDEX IF NOT EXISTS idx_sge_prices_estimated ON sge_prices(is_estimated);
CREATE INDEX IF NOT EXISTS idx_retail_prices_discovery ON retail_prices(discovery_strategy);
CREATE INDEX IF NOT EXISTS idx_retail_prices_http_status ON retail_prices(http_status_code);

-- =====================================================
-- Validation query (for manual verification)
-- =====================================================

-- SELECT 
--   'SGE Prices with metadata' as check_name,
--   count(*) as total,
--   count(provider) as with_provider,
--   count(conversion_steps) as with_conversion_steps
-- FROM sge_prices;

-- SELECT 
--   'Retail Prices with discovery' as check_name,
--   count(*) as total,
--   count(discovery_strategy) as with_discovery,
--   count(attempted_urls) as with_attempted_urls
-- FROM retail_prices;
