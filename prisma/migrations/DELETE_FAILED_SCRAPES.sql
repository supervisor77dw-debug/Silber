-- Delete FAILED retail entries with price_eur = 0
-- These are failed scraper attempts with no usable data

DELETE FROM retail_prices
WHERE verification_status = 'FAILED' 
  AND price_eur = 0;

-- Verify - should show 0 rows
SELECT count(*) as remaining_rows FROM retail_prices;

-- If any rows remain, show them
SELECT * FROM retail_prices ORDER BY date DESC;
