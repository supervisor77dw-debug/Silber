-- Testdaten für lokale Entwicklung (SQLite)
-- Diese Daten ermöglichen es, die App zu testen ohne echte API-Calls

-- FX Rate
INSERT INTO fx_rates (id, date, usdCnyRate, source, fetchedAt)
VALUES 
  ('fx001', '2026-01-01T00:00:00.000Z', 7.25, 'manual', datetime('now')),
  ('fx002', '2025-12-31T00:00:00.000Z', 7.24, 'manual', datetime('now')),
  ('fx003', '2025-12-30T00:00:00.000Z', 7.26, 'manual', datetime('now'));

-- COMEX Price
INSERT INTO comex_prices (id, date, priceUsdPerOz, contract, fetchedAt)
VALUES 
  ('cp001', '2026-01-01T00:00:00.000Z', 32.50, 'Spot', datetime('now')),
  ('cp002', '2025-12-31T00:00:00.000Z', 32.45, 'Spot', datetime('now')),
  ('cp003', '2025-12-30T00:00:00.000Z', 32.40, 'Spot', datetime('now'));

-- SGE Price  
INSERT INTO sge_prices (id, date, priceCnyPerGram, priceUsdPerOz, fetchedAt)
VALUES 
  ('sg001', '2026-01-01T00:00:00.000Z', 7.50, 32.80, datetime('now')),
  ('sg002', '2025-12-31T00:00:00.000Z', 7.48, 32.75, datetime('now')),
  ('sg003', '2025-12-30T00:00:00.000Z', 7.47, 32.71, datetime('now'));

-- COMEX Stock
INSERT INTO comex_stocks (id, date, totalRegistered, totalEligible, totalCombined, registeredPercent, deltaRegistered, deltaEligible, deltaCombined, isValidated, fetchedAt)
VALUES 
  ('cs001', '2026-01-01T00:00:00.000Z', 50000000, 150000000, 200000000, 25.0, -500000, 200000, -300000, 1, datetime('now')),
  ('cs002', '2025-12-31T00:00:00.000Z', 50500000, 149800000, 200300000, 25.2, -800000, 300000, -500000, 1, datetime('now')),
  ('cs003', '2025-12-30T00:00:00.000Z', 51300000, 149500000, 200800000, 25.5, NULL, NULL, NULL, 1, datetime('now'));

-- Daily Spread
INSERT INTO daily_spreads (id, date, sgeUsdPerOz, comexUsdPerOz, spreadUsdPerOz, spreadPercent, registered, eligible, total, registeredPercent, isExtreme, zScore)
VALUES 
  ('ds001', '2026-01-01T00:00:00.000Z', 32.80, 32.50, 0.30, 0.92, 50000000, 150000000, 200000000, 25.0, 0, 0.5),
  ('ds002', '2025-12-31T00:00:00.000Z', 32.75, 32.45, 0.30, 0.92, 50500000, 149800000, 200300000, 25.2, 0, 0.4),
  ('ds003', '2025-12-30T00:00:00.000Z', 32.71, 32.40, 0.31, 0.96, 51300000, 149500000, 200800000, 25.5, 0, 0.6);

-- Fetch Log
INSERT INTO fetch_logs (id, date, source, status, fetchedAt)
VALUES 
  ('fl001', '2026-01-01T00:00:00.000Z', 'ALL', 'success', datetime('now'));

-- Hinweis: Für Produktionsdaten müssen echte APIs implementiert werden
