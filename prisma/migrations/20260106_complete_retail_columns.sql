-- ========================================
-- COMPLETE RETAIL_PRICES COLUMNS MIGRATION
-- ========================================
-- Date: 2026-01-06
-- Purpose: Add ALL missing columns to production DB
-- 
-- Background: Production DB was created with basic columns only.
-- This migration adds verification, FX conversion, and premium calculation fields.
--
-- ========================================

-- Step 1: Add missing columns (in small batches to avoid timeout)

-- Batch 1: Verification columns (most important)
ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS raw_excerpt TEXT;

-- Batch 2: FX conversion columns
ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS price_usd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS fx_rate DOUBLE PRECISION;

-- Batch 3: Premium calculation columns
ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS fine_oz DOUBLE PRECISION DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS implied_usd_oz DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS premium_percent DOUBLE PRECISION;

-- Batch 4: Source tracking
ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'scraper';

-- Step 2: Create indexes for verification filtering
CREATE INDEX IF NOT EXISTS idx_retail_verification_status 
  ON retail_prices(verification_status);

CREATE INDEX IF NOT EXISTS idx_retail_verified 
  ON retail_prices(verification_status, date DESC);

-- Step 3: Add column comments for documentation
COMMENT ON COLUMN retail_prices.price_usd IS 'Price converted to USD using fx_rate';
COMMENT ON COLUMN retail_prices.currency IS 'Original currency (EUR, USD, etc.)';
COMMENT ON COLUMN retail_prices.fx_rate IS 'EUR/USD exchange rate used for conversion';
COMMENT ON COLUMN retail_prices.fine_oz IS 'Fine ounces of silver (usually 1.0)';
COMMENT ON COLUMN retail_prices.implied_usd_oz IS 'Price per troy ounce in USD';
COMMENT ON COLUMN retail_prices.premium_percent IS 'Premium over spot price in %';
COMMENT ON COLUMN retail_prices.source IS 'Data source: scraper, manual, api';
COMMENT ON COLUMN retail_prices.raw_excerpt IS 'HTML/JSON snippet with price (max 2KB) for audit';
COMMENT ON COLUMN retail_prices.verification_status IS 'VERIFIED, UNVERIFIED, INVALID_PARSE, or FAILED';

-- Step 4: Verify migration success
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'retail_prices'
ORDER BY ordinal_position;

-- Expected output should include ALL columns:
-- id, date, provider, product, price_eur, source_url, fetched_at (existing)
-- price_usd, currency, fx_rate, fine_oz, implied_usd_oz, premium_percent, source, raw_excerpt, verification_status (new)
