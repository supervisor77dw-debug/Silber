-- Add UNIQUE constraint to retail_prices to prevent duplicates
-- Date: 2026-01-04

-- First, delete existing duplicates (keep newest)
DELETE FROM retail_prices
WHERE id NOT IN (
  SELECT DISTINCT ON (date, provider, product) id
  FROM retail_prices
  ORDER BY date, provider, product, fetched_at DESC
);

-- Add UNIQUE constraint
ALTER TABLE retail_prices
ADD CONSTRAINT retail_prices_date_provider_product_key 
UNIQUE (date, provider, product);

-- Verify
SELECT COUNT(*) as total_rows FROM retail_prices;
