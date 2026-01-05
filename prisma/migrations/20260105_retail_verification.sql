-- Add verification tracking fields to retail_prices
ALTER TABLE retail_prices
ADD COLUMN IF NOT EXISTS raw_excerpt TEXT,
ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN IF NOT EXISTS price_usd DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(10,6),
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR';

-- Create index for filtering by verification status
CREATE INDEX IF NOT EXISTS idx_retail_prices_verification ON retail_prices(verification_status);

COMMENT ON COLUMN retail_prices.raw_excerpt IS 'HTML/JSON snippet containing the price (max 2KB) for audit';
COMMENT ON COLUMN retail_prices.verification_status IS 'VERIFIED, UNVERIFIED, or FAILED';
COMMENT ON COLUMN retail_prices.price_usd IS 'Price converted to USD using fx_rate';
COMMENT ON COLUMN retail_prices.fx_rate IS 'EUR/USD exchange rate used for conversion';
COMMENT ON COLUMN retail_prices.currency IS 'Original currency of the price (EUR, USD, etc.)';
