# SQL Verification Queries for retail_prices

## Schema Status ✅

**Database Reality:**
- Table: `retail_prices`
- Columns: `provider`, `product` (NOT `product_name`)
- UNIQUE constraint: `retail_prices_date_provider_product_key` on `(date, provider, product)`
- Mapping: `priceEur` → `price_eur`, `priceUsd` → `price_usd`, etc.

**Code Status: ✅ VERIFIED CORRECT**
- All Prisma queries use correct column names
- All raw SQL queries use snake_case column names correctly
- UPSERT uses correct constraint: `date_provider_product`

## Production Verification Queries

### 1. Recent Retail Prices (Last 50 Writes)

```sql
SELECT 
  date,
  provider,
  product,
  price_eur,
  price_usd,
  currency,
  fx_rate,
  verification_status,
  source,
  fetched_at
FROM retail_prices
ORDER BY fetched_at DESC
LIMIT 50;
```

**Expected Output in Production:**
- Should be empty (0 rows) until scraper is implemented
- In Development: 10 rows (5 Degussa + 5 ProAurum mock products)

### 2. Provider Coverage

```sql
SELECT 
  provider,
  COUNT(*) as product_count,
  COUNT(DISTINCT product) as unique_products,
  MAX(date) as latest_date,
  MAX(fetched_at) as last_update
FROM retail_prices
GROUP BY provider
ORDER BY provider;
```

**Target (Development):**
```
provider   | product_count | unique_products | latest_date | last_update
-----------|---------------|-----------------|-------------|-------------
Degussa    | 5             | 5               | 2025-01-05  | 2025-01-05 ...
ProAurum   | 5             | 5               | 2025-01-05  | 2025-01-05 ...
```

**Target (Production when implemented):**
- Each provider should have 5-10 distinct products
- All products updated daily

### 3. Product Distribution

```sql
SELECT 
  product,
  COUNT(*) as provider_count,
  STRING_AGG(provider, ', ') as providers,
  AVG(price_eur) as avg_price_eur,
  MIN(price_eur) as min_price,
  MAX(price_eur) as max_price
FROM retail_prices
WHERE date = (SELECT MAX(date) FROM retail_prices)
GROUP BY product
ORDER BY product;
```

**Expected Products:**
- 1oz Maple Leaf
- 1oz Philharmoniker
- 1oz American Eagle
- 1oz Känguru
- 1oz Britannia
- 1kg Silberbarren

### 4. Data Quality Check

```sql
SELECT 
  COUNT(*) as total_rows,
  COUNT(CASE WHEN price_usd IS NULL THEN 1 END) as missing_price_usd,
  COUNT(CASE WHEN fx_rate IS NULL THEN 1 END) as missing_fx_rate,
  COUNT(CASE WHEN source_url IS NULL THEN 1 END) as missing_source_url,
  COUNT(CASE WHEN raw_excerpt IS NULL THEN 1 END) as missing_raw_excerpt,
  COUNT(CASE WHEN verification_status = 'VERIFIED' THEN 1 END) as verified_count,
  COUNT(CASE WHEN verification_status = 'UNVERIFIED' THEN 1 END) as unverified_count
FROM retail_prices;
```

**Production Requirements:**
- `missing_source_url` = 0 (all rows must have source URL)
- `missing_raw_excerpt` = 0 (all rows must have proof)
- `verified_count` > 0 (aim for 100% verification)

### 5. Historical Coverage (Last 7 Days)

```sql
SELECT 
  date,
  COUNT(*) as total_entries,
  COUNT(DISTINCT provider) as providers,
  COUNT(DISTINCT product) as products,
  STRING_AGG(DISTINCT provider, ', ') as provider_list
FROM retail_prices
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY date
ORDER BY date DESC;
```

**Target:**
- Daily entries (no gaps)
- Consistent provider count (2+ providers)
- Consistent product count (10+ products)

### 6. UPSERT Conflict Test

```sql
-- Check if constraint exists
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'retail_prices'::regclass
  AND conname LIKE '%date_provider_product%';
```

**Expected:**
```
constraint_name                          | constraint_type | definition
-----------------------------------------|-----------------|---------------------------
retail_prices_date_provider_product_key  | u               | UNIQUE (date, provider, product)
```

### 7. Latest Price Per Provider/Product

```sql
SELECT DISTINCT ON (provider, product)
  date,
  provider,
  product,
  price_eur,
  price_usd,
  currency,
  verification_status,
  source_url,
  fetched_at
FROM retail_prices
ORDER BY provider, product, date DESC, fetched_at DESC;
```

This is the **exact query** used by `/api/retail-prices` endpoint.

## Verification Checklist

- [ ] Schema matches code (provider, product columns exist)
- [ ] UNIQUE constraint works (try inserting duplicate date/provider/product)
- [ ] UPSERT updates existing rows instead of creating duplicates
- [ ] All rows have non-null sourceUrl and rawExcerpt
- [ ] verificationStatus is either VERIFIED or UNVERIFIED
- [ ] priceUsd and fxRate populated when possible
- [ ] Each provider has 5-10 distinct products
- [ ] Daily backfill works (no gaps in dates)

## Next Steps

1. **Development**: Run `/api/refresh` to populate 10 mock products
2. **Verify**: Run queries above to confirm schema correctness
3. **Production**: Implement real scrapers for Degussa, ProAurum
4. **Monitor**: Check daily that retail_prices grows consistently

## Notes

- Mock data only appears in `NODE_ENV !== 'production'`
- Production must use real scrapers with source URLs
- All prices must be verifiable with `rawExcerpt` field
- UPSERT prevents duplicates via `date_provider_product` constraint
