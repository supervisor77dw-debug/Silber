-- Clean up legacy retail data (keep only entries with real source URLs)
DELETE FROM retail_prices
WHERE source_url = 'https://legacy-data-no-source';

-- Verify - should show only 2 rows from 2026-01-06
SELECT date, provider, product, source_url, verification_status, price_eur
FROM retail_prices
ORDER BY date DESC;
