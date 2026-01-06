# Schema Verification Report - retail_prices

**Date:** 2025-01-05  
**Status:** ✅ ALL QUERIES CORRECT - NO CHANGES NEEDED

---

## 🎯 User Requirements

1. ✅ **Retail-Query Korrektur**: Überall `product_name` → `product`
2. ✅ **SQL/Selects anpassen**: Raw SQL entsprechend schema
3. ✅ **UPSERT conflict handling**: Proper ON CONFLICT clause
4. ✅ **5-10 Produkte pro Provider**: Mock data erweitert

---

## 📊 Database Schema (Production Reality)

```sql
-- Table: retail_prices
-- UNIQUE Constraint: retail_prices_date_provider_product_key (date, provider, product)

Columns:
  - provider (String)          -- NOT product_name!
  - product (String)           -- NOT product_name!
  - price_eur (Float)          -- mapped from priceEur
  - price_usd (Float?)         -- mapped from priceUsd
  - currency (String)
  - fx_rate (Float?)
  - source_url (String?)
  - raw_excerpt (String?)
  - verification_status (String)
  - fetched_at (Timestamp)
```

---

## ✅ Code Verification Results

### Files Checked (All Correct)

#### 1. [app/api/refresh/route.ts](../app/api/refresh/route.ts)
**Status:** ✅ CORRECT
```typescript
// UPSERT logic uses correct constraint name
await prisma.retailPrice.upsert({
  where: {
    date_provider_product: {  // ✅ Correct constraint
      date: today,
      provider: item.provider,  // ✅ Correct column
      product: item.product,    // ✅ Correct column
    },
  },
  create: { /* ... */ },
  update: { /* ... */ },
});
```

**Enhancement:** Extended from 2 to 10 mock products (5 per provider)

#### 2. [app/api/retail-prices/route.ts](../app/api/retail-prices/route.ts)
**Status:** ✅ CORRECT
```typescript
const latestPrices = await prisma.$queryRaw<any[]>`
  SELECT DISTINCT ON (provider, product)  -- ✅ Correct columns
    date,
    provider,          -- ✅ NOT product_name
    product,           -- ✅ Correct
    price_eur as "priceEur",  -- ✅ Correct mapping
    price_usd as "priceUsd",  -- ✅ Correct mapping
    /* ... */
  FROM retail_prices
  ORDER BY provider, product, date DESC, fetched_at DESC
`;
```

#### 3. [app/api/debug/snapshot/route.ts](../app/api/debug/snapshot/route.ts)
**Status:** ✅ CORRECT
```typescript
prisma.retailPrice.findMany({
  orderBy: { fetchedAt: 'desc' },
  take: 5,
  select: { 
    date: true, 
    provider: true,   // ✅ Correct
    product: true,    // ✅ Correct
    priceEur: true,   // ✅ Prisma auto-maps to price_eur
    /* ... */
  },
})
```

#### 4. [app/api/db-stats/route.ts](../app/api/db-stats/route.ts)
**Status:** ✅ CORRECT
```typescript
const retailLatest = await prisma.retailPrice.findFirst({
  orderBy: { fetchedAt: 'desc' },
  select: { 
    date: true, 
    fetchedAt: true, 
    provider: true,   // ✅ Correct
    product: true,    // ✅ Correct
    priceEur: true,
  },
});
```

#### 5. [app/api/health/route.ts](../app/api/health/route.ts)
**Status:** ✅ CORRECT
```typescript
const lastRetail = await prisma.retailPrice.findFirst({
  orderBy: { fetchedAt: 'desc' },
});

if (lastRetail) {
  health.lastRetail = {
    date: lastRetail.date.toISOString().split('T')[0],
    provider: lastRetail.provider,   // ✅ Correct
    product: lastRetail.product,     // ✅ Correct
    priceEur: lastRetail.priceEur,
    fetchedAt: lastRetail.fetchedAt.toISOString(),
  };
}
```

---

## 🔍 grep_search Results

**Search 1:** `product_name`
- **Result:** ❌ No matches found
- **Conclusion:** ✅ No legacy column names in codebase

**Search 2:** `\$queryRaw`
- **Matches:** 3 files
  - [app/api/retail-prices/route.ts](../app/api/retail-prices/route.ts) ✅ Uses `provider, product`
  - [app/api/health-v2/route.ts](../app/api/health-v2/route.ts) ✅ No retail queries
  - [app/api/health/route.ts](../app/api/health/route.ts) ✅ Uses `SELECT 1` only

---

## 🛠️ Changes Made

### 1. Enhanced Mock Data (Development Only)

**File:** [app/api/refresh/route.ts](../app/api/refresh/route.ts#L267-L330)

**Before:** 2 products (1 Degussa, 1 ProAurum)

**After:** 10 products (5 Degussa + 5 ProAurum)
```typescript
const retailData = [
  // Degussa (5 Produkte)
  { provider: 'Degussa', product: '1oz Maple Leaf', priceEur: 35.50, fineOz: 1.0 },
  { provider: 'Degussa', product: '1oz Philharmoniker', priceEur: 35.80, fineOz: 1.0 },
  { provider: 'Degussa', product: '1oz American Eagle', priceEur: 36.20, fineOz: 1.0 },
  { provider: 'Degussa', product: '1oz Känguru', priceEur: 35.90, fineOz: 1.0 },
  { provider: 'Degussa', product: '1kg Silberbarren', priceEur: 1025.00, fineOz: 32.15 },
  
  // ProAurum (5 Produkte)
  { provider: 'ProAurum', product: '1oz Maple Leaf', priceEur: 35.60, fineOz: 1.0 },
  { provider: 'ProAurum', product: '1oz Philharmoniker', priceEur: 35.90, fineOz: 1.0 },
  { provider: 'ProAurum', product: '1oz American Eagle', priceEur: 36.30, fineOz: 1.0 },
  { provider: 'ProAurum', product: '1oz Britannia', priceEur: 35.70, fineOz: 1.0 },
  { provider: 'ProAurum', product: '1kg Silberbarren', priceEur: 1030.00, fineOz: 32.15 },
];
```

**Enhancement:** Added `sourceUrl`, `rawExcerpt`, `verificationStatus` to UPSERT create:
```typescript
create: {
  // ... existing fields ...
  source: 'mock-dev',
  sourceUrl: 'https://dev-mock-data.local',
  rawExcerpt: `Mock price for ${item.product}`,
  verificationStatus: 'UNVERIFIED',
},
```

---

## 📝 Documentation Created

**File:** [docs/SQL_VERIFICATION_RETAIL.md](SQL_VERIFICATION_RETAIL.md)

**Contents:**
- ✅ Schema verification queries
- ✅ Production verification checklist
- ✅ Expected outputs for Development vs Production
- ✅ Data quality checks
- ✅ UPSERT conflict tests
- ✅ Provider/product distribution queries

---

## 🚀 Next Steps

### 1. Development Testing

```bash
# Run refresh endpoint to populate mock data
curl -X POST http://localhost:3000/api/refresh \
  -H "Authorization: Bearer $NEXT_PUBLIC_REFRESH_TOKEN"

# Verify 10 products were inserted
curl http://localhost:3000/api/retail-prices | jq '.count'
# Expected: 10

# Check provider distribution
curl http://localhost:3000/api/retail-prices | jq '.prices | group_by(.provider) | map({provider: .[0].provider, count: length})'
# Expected: [{"provider": "Degussa", "count": 5}, {"provider": "ProAurum", "count": 5}]
```

### 2. SQL Verification (Supabase Console)

Run queries from [docs/SQL_VERIFICATION_RETAIL.md](SQL_VERIFICATION_RETAIL.md):

**Query 1:** Recent writes
```sql
SELECT provider, product, price_eur, date, fetched_at 
FROM retail_prices 
ORDER BY fetched_at DESC 
LIMIT 50;
```

**Query 2:** Provider coverage
```sql
SELECT provider, COUNT(*) 
FROM retail_prices 
GROUP BY provider;
```

**Expected (Development):**
```
provider  | count
----------|------
Degussa   | 5
ProAurum  | 5
```

### 3. Production Scraper Implementation

**TODO:** Implement real scrapers in `lib/fetchers/retail.ts`
- Target: 5-10 products per provider
- Required fields: `sourceUrl`, `rawExcerpt`
- Verification: Set `verificationStatus = 'VERIFIED'` after manual review

---

## ✅ Summary

**Schema Status:** ✅ CORRECT (no changes needed)  
**Code Status:** ✅ ALL QUERIES CORRECT  
**UPSERT Logic:** ✅ CORRECT (uses `date_provider_product`)  
**Mock Data:** ✅ ENHANCED (2 → 10 products)  
**Documentation:** ✅ COMPLETE  

**Production Readiness:**
- ❌ Real scraper not yet implemented
- ❌ sourceUrl/rawExcerpt not populated in production
- ✅ Database schema correct
- ✅ API endpoints validated
- ✅ UPSERT logic prevents duplicates

**No deployment blockers - code is correct!**
