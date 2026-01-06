# Retail Scraper Deployment Guide - PRODUCTION READY

**Date:** 2026-01-06  
**Status:** ✅ Code Complete - Migration Required

---

## 🎯 What Changed

### ✅ Implemented
1. **Real retail scrapers** for ProAurum & Degussa (Node runtime)
2. **Plausibility checks** against spot price (±5% validation)
3. **Mandatory verification** - NO prices without source_url
4. **UI enforcement** - ONLY shows VERIFIED prices
5. **Migration SQL** - source_url NOT NULL constraint

### ❌ Removed
- All mock/dummy retail data (€35.50/€35.80)
- Development-only code paths
- Fallback prices without source

---

## 📋 Pre-Deployment Checklist

### 1. Database Migration (CRITICAL - Run First!)

**Connect to Supabase SQL Editor:**
```sql
-- Step 1: DELETE all existing dummy data
DELETE FROM retail_prices WHERE source_url IS NULL;
DELETE FROM retail_prices WHERE source = 'mock-dev';

-- Step 2: Make source_url mandatory
ALTER TABLE retail_prices
  ALTER COLUMN source_url SET NOT NULL;

-- Step 3: Add check constraint for verification statuses
ALTER TABLE retail_prices
  ADD CONSTRAINT valid_verification_status 
  CHECK (verification_status IN ('VERIFIED', 'UNVERIFIED', 'INVALID_PARSE', 'FAILED'));

-- Step 4: Create index for verified prices
CREATE INDEX IF NOT EXISTS idx_retail_verified 
  ON retail_prices(verification_status, date DESC) 
  WHERE verification_status = 'VERIFIED';

-- Verification (should return 0):
SELECT COUNT(*) FROM retail_prices WHERE source_url IS NULL;
```

**Expected Result:**
```
count
-----
0
```

### 2. Environment Variables (Already Set)

Verify in Vercel Dashboard:
- `DATABASE_URL` - Supabase connection string ✓
- `CRON_SECRET` - For cron jobs ✓
- `NEXT_PUBLIC_REFRESH_TOKEN` - For manual refreshes ✓

No new variables needed!

### 3. Dependencies

Already installed:
```bash
npm install cheerio  # HTML parsing for scrapers
```

Build verified: ✅ Compiles successfully

---

## 🚀 Deployment Steps

### Step 1: Push to GitHub

```bash
git add -A
git commit -m "PRODUCTION: Real retail scrapers with mandatory verification"
git push origin main
```

### Step 2: Run Migration in Supabase

1. Open Supabase Dashboard → SQL Editor
2. Paste migration from section above
3. Execute
4. Verify with: `SELECT * FROM retail_prices;` → Should be empty

### Step 3: Deploy to Vercel

Auto-deploys from GitHub push (or click "Deploy" in Vercel dashboard)

### Step 4: Test Retail Scraper

```bash
# Trigger manual refresh
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer $NEXT_PUBLIC_REFRESH_TOKEN"

# Check retail prices
curl https://silber-ten.vercel.app/api/retail-prices | jq '.'
```

**Expected Response:**
```json
{
  "ok": true,
  "count": 2,  // or 0 if scrapers fail
  "prices": [
    {
      "provider": "ProAurum",
      "product": "1oz Philharmoniker",
      "priceEur": 80.50,  // Real price from website
      "sourceUrl": "https://www.proaurum.de/...",
      "verificationStatus": "VERIFIED"  // or INVALID_PARSE if too low
    }
  ]
}
```

### Step 5: Verify UI

1. Open https://silber-ten.vercel.app
2. Check "Retail Prices" section:
   - ✅ Shows green "✓ Verified" badge if scraper succeeds
   - ⚠️ Shows yellow warning if INVALID_PARSE (price vs spot mismatch)
   - ❌ Shows red error if scraper fails (HTTP error, parse error)
   - 🔗 "Quelle prüfen" link works

---

## 🔍 Verification Queries (Supabase SQL)

### Query 1: Check Latest Prices
```sql
SELECT 
  date,
  provider,
  product,
  price_eur,
  source_url,
  verification_status,
  fetched_at
FROM retail_prices
ORDER BY fetched_at DESC
LIMIT 20;
```

**Expected:**
- `source_url` is NEVER NULL
- `verification_status` is 'VERIFIED' for good prices
- `verification_status` is 'INVALID_PARSE' if price < spot * 0.95
- `verification_status` is 'FAILED' if scraper crashed

### Query 2: Verification Status Distribution
```sql
SELECT 
  verification_status,
  COUNT(*) as count,
  AVG(price_eur) as avg_price
FROM retail_prices
GROUP BY verification_status;
```

**Target:**
```
verification_status | count | avg_price
--------------------|-------|----------
VERIFIED            | 2     | 80.00
```

### Query 3: Check for NULL sources (MUST BE ZERO)
```sql
SELECT COUNT(*) as invalid_rows
FROM retail_prices
WHERE source_url IS NULL;
```

**Expected:**
```
invalid_rows
------------
0
```

---

## 🛡️ How Verification Works

### Scraper Flow

```
1. Fetch HTML from ProAurum/Degussa URLs
   ↓
2. Parse price using multiple methods:
   - Meta tags (property="product:price:amount")
   - JSON-LD schema.org
   - CSS selectors (.price-value, [data-price-amount], etc.)
   ↓
3. Plausibility Check:
   spotEUR = metal_prices.xag_usd_close / usd_eur_rate
   IF price < spotEUR * 0.95 → INVALID_PARSE
   IF price > spotEUR * 20 → INVALID_PARSE
   ELSE → VERIFIED
   ↓
4. UPSERT to DB with:
   - source_url (NOT NULL)
   - raw_excerpt (proof of price)
   - verification_status
```

### UI Filtering

```typescript
// NEVER show unverified prices
const verifiedPrices = prices.filter(p => 
  p.verificationStatus === 'VERIFIED' && 
  p.sourceUrl
);

// Show warnings for failures
const invalidPrices = prices.filter(p => 
  p.verificationStatus === 'INVALID_PARSE'
);
```

---

## 🐛 Troubleshooting

### Problem: "No verified retail prices"

**Symptoms:** UI shows yellow warning box

**Possible Causes:**
1. Scraper failed (website structure changed)
2. Price parsed incorrectly (too low vs spot)
3. Network timeout

**Debug:**
```bash
# Check Vercel logs
vercel logs --follow

# Look for:
[RETAIL_ERROR] Could not extract price from HTML
[RETAIL_RESULT] status: INVALID_PARSE
```

**Fix:**
1. Check website URLs still work
2. Inspect HTML source for changed selectors
3. Update CSS selectors in `lib/fetchers/retail.ts`

### Problem: "INVALID_PARSE" status

**Symptoms:** Prices fetched but marked invalid

**Cause:** Price < spot * 0.95 (parsing error likely)

**Debug:**
```sql
SELECT 
  provider,
  product,
  price_eur,
  source_url,
  raw_excerpt
FROM retail_prices
WHERE verification_status = 'INVALID_PARSE';
```

**Fix:**
1. Check `raw_excerpt` column for what was parsed
2. Verify correct CSS selector used
3. Check if price includes VAT (might need adjustment)

### Problem: "source_url IS NULL" error

**Symptoms:** Database insert fails

**Cause:** Scraper returned empty sourceUrl

**Debug:**
Check scraper implementation in `lib/fetchers/retail.ts`:
```typescript
// Each scraper MUST return sourceUrl
return {
  provider: 'ProAurum',
  product: '1oz Philharmoniker',
  sourceUrl: url,  // ← Must not be empty!
  // ...
};
```

---

## 📊 Expected Production Behavior

### Success Case (Ideal)
```
retail_prices table:
- 2+ rows (Degussa + ProAurum)
- All have source_url NOT NULL
- All have verification_status = 'VERIFIED'
- Prices ~€80-90 (realistic for 1oz silver + premium)

UI displays:
- Green "✓ Verified" badges
- Prices with source links
- Premium % calculated
```

### Parser Error Case
```
retail_prices table:
- 2 rows with verification_status = 'INVALID_PARSE'
- source_url populated
- raw_excerpt shows what was parsed

UI displays:
- Yellow warning box
- "ungültige Parse(s): zu niedrig/hoch vs Spot"
- Link to source for manual verification
```

### Network Error Case
```
retail_prices table:
- 2 rows with verification_status = 'FAILED'
- source_url populated
- raw_excerpt empty

UI displays:
- Yellow warning box
- "Fetch-Fehler"
- Link to source
```

---

## 🔄 Maintenance

### Update Scraper URLs

If product URLs change:

**Edit:** `lib/fetchers/retail.ts`

```typescript
// ProAurum
const url = 'https://www.proaurum.de/...[NEW_URL]';

// Degussa
const url = 'https://www.degussa-goldhandel.de/...[NEW_URL]';
```

### Add New Products

To scrape more than just Maple Leaf & Philharmoniker:

1. Add new scraper function in `lib/fetchers/retail.ts`
2. Add to `fetchRetailPrices()` array
3. Each product needs unique (provider, product) combination

### Adjust Plausibility Bounds

Currently: `price >= spot * 0.95` and `price <= spot * 20`

**To change:**
```typescript
// lib/fetchers/retail.ts
const minRetailEur = spotEur * 0.90;  // ← Adjust threshold
const maxRetailEur = spotEur * 15;     // ← Adjust threshold
```

---

## ✅ Deployment Checklist

- [ ] Run migration SQL in Supabase (source_url NOT NULL)
- [ ] Verify: `SELECT COUNT(*) FROM retail_prices WHERE source_url IS NULL;` → 0
- [ ] Push code to GitHub
- [ ] Verify Vercel deployment succeeds
- [ ] Trigger `/api/refresh` manually
- [ ] Check `/api/retail-prices` returns verified prices
- [ ] Verify UI shows green badges or appropriate warnings
- [ ] Screenshot UI for documentation
- [ ] Monitor Vercel logs for scraper errors

---

## 📸 Expected UI States

### State 1: Verified Prices (Success)
```
┌─────────────────────────────────────┐
│ 🪙 Retail Prices (Händlerpreise)   │
├─────────────────────────────────────┤
│ ProAurum ✓ Verified                 │
│   1oz Philharmoniker    €82.50      │
│   Fine Oz: 1.0  USD/oz: $91.00      │
│   Premium: +12.5%                   │
│   🔗 Quelle prüfen                  │
├─────────────────────────────────────┤
│ Degussa ✓ Verified                  │
│   1oz Maple Leaf        €81.90      │
│   Fine Oz: 1.0  USD/oz: $90.34      │
│   Premium: +11.8%                   │
│   🔗 Quelle prüfen                  │
└─────────────────────────────────────┘
```

### State 2: Parse Errors (Warning)
```
┌─────────────────────────────────────┐
│ 🪙 Retail Prices (Händlerpreise)   │
├─────────────────────────────────────┤
│ ⚠ Keine verifizierten Retail-Preise│
│ Es wurden keine Preise mit gültiger │
│ Quelle gefunden.                    │
│                                     │
│ 2 ungültige Parse(s):               │
│ • ProAurum - 1oz Philharmoniker:    │
│   €35.80 (zu niedrig vs Spot)       │
│   🔗 Quelle prüfen                  │
└─────────────────────────────────────┘
```

### State 3: Scraper Failure (Error)
```
┌─────────────────────────────────────┐
│ 🪙 Retail Prices (Händlerpreise)   │
├─────────────────────────────────────┤
│ ⚠ Keine verifizierten Retail-Preise│
│                                     │
│ 2 Fetch-Fehler:                     │
│ • ProAurum - 1oz Philharmoniker     │
│   🔗 Quelle prüfen                  │
│ • Degussa - 1oz Maple Leaf          │
│   🔗 Quelle prüfen                  │
└─────────────────────────────────────┘
```

---

## 🎯 Success Criteria

**Deployment is successful when:**

1. ✅ Migration completed (no rows with source_url IS NULL)
2. ✅ Build passes (`npm run build`)
3. ✅ Vercel deployment succeeds
4. ✅ `/api/refresh` executes without 500 errors
5. ✅ `/api/retail-prices` returns data or appropriate empty state
6. ✅ UI shows either:
   - Green verified prices with source links, OR
   - Yellow warnings with diagnostic info (not silent failures)
7. ✅ No €35.50/€35.80 dummy prices appear in production

**If ANY dummy prices appear → ROLLBACK!**
