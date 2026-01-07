-- Fix NULL source_url in existing retail_prices data
-- Problem: Old rows have source_url = NULL, but code expects it

-- Update NULL source_urls with placeholder
UPDATE retail_prices
SET source_url = 'https://legacy-data-no-source'
WHERE source_url IS NULL;

-- Verify no more NULLs
SELECT 
  count(*) as total_rows,
  count(source_url) as rows_with_source_url,
  count(*) - count(source_url) as rows_with_null
FROM retail_prices;

-- Show updated rows
SELECT date, provider, product, source_url, verification_status
FROM retail_prices
ORDER BY date DESC;
