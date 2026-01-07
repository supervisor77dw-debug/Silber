-- DELETE old retail_prices without source_url
-- Cleaner solution: Remove legacy data that has no verification

DELETE FROM retail_prices
WHERE source_url IS NULL;

-- Verify deletion
SELECT count(*) as remaining_rows
FROM retail_prices;

-- Show what's left
SELECT date, provider, product, source_url, verification_status
FROM retail_prices
ORDER BY date DESC;
