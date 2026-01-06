# Missing Columns Migration

**Deployment:** CQZhMaBrf (production)  
**Commit:** 0ebe119  
**Problem:** Prisma Schema hat Spalten die in Production DB nicht existieren

---

## AKTUELLER ZUSTAND

### Prisma Schema (schema.prisma)
```prisma
model RetailPrice {
  priceEur           Float    @map("price_eur")
  priceUsd           Float?   @map("price_usd")
  currency           String   @default("EUR")
  fxRate             Float?   @map("fx_rate")
  fineOz             Float    @default(1.0) @map("fine_oz")
  impliedUsdOz       Float?   @map("implied_usd_oz")
  premiumPercent     Float?   @map("premium_percent")
  source             String   @default("scraper")
  sourceUrl          String   @map("source_url")
  rawExcerpt         String?  @map("raw_excerpt")
  verificationStatus String   @default("UNVERIFIED") @map("verification_status")
}
```

### Production DB (Supabase)
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'retail_prices';
```

**Existierende Spalten:**
- `id` (text)
- `date` (date)
- `provider` (text)
- `product` (text)
- `price_eur` (double precision)
- `source_url` (text)
- `fetched_at` (timestamptz)

**FEHLENDE Spalten:**
- `price_usd`
- `currency`
- `fx_rate`
- `fine_oz`
- `implied_usd_oz`
- `premium_percent`
- `source`
- `raw_excerpt`
- `verification_status` ← **Wichtigste Spalte für Scraper-Validierung**

---

## MIGRATION SQL

**WICHTIG:** Diese Migration fügt die fehlenden Spalten hinzu. Führe sie in Supabase SQL Editor aus:

```sql
-- Add missing columns to retail_prices table
ALTER TABLE retail_prices 
  ADD COLUMN IF NOT EXISTS price_usd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS fx_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fine_oz DOUBLE PRECISION DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS implied_usd_oz DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS premium_percent DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'scraper',
  ADD COLUMN IF NOT EXISTS raw_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED';

-- Create index on verification_status
CREATE INDEX IF NOT EXISTS idx_retail_verification_status 
  ON retail_prices(verification_status);

-- Create composite index for verified prices
CREATE INDEX IF NOT EXISTS idx_retail_verified 
  ON retail_prices(verification_status, date DESC);

-- Verify columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'retail_prices'
ORDER BY ordinal_position;
```

---

## WARUM IST DAS NOTWENDIG?

### 1. Scraper Verification (Kritisch)
- `verification_status`: Unterscheidet VERIFIED vs UNVERIFIED Preise
- `raw_excerpt`: Speichert HTML-Snippet als Beweis für Parsing
- Ohne diese Spalten: Scraper kann nicht zwischen gültigen/ungültigen Preisen unterscheiden

### 2. FX Conversion (Nice-to-have)
- `price_usd`, `fx_rate`, `currency`: USD-Konvertierung
- `implied_usd_oz`: Premium-Kalkulation vs Spot
- Ermöglicht internationale Preisvergleiche

### 3. Premium Calculation
- `fine_oz`: Feingewicht (meist 1.0)
- `premium_percent`: % über Spot-Preis
- Zeigt Händler-Aufschläge an

---

## NACH DER MIGRATION

### 1. Prisma Client regenerieren (LOCAL)
```bash
npx prisma generate
```

### 2. Code wieder aktivieren
Die Endpoints `/api/retail-prices`, `/api/healthz` und `/api/debug/snapshot` können dann wieder ALLE Spalten selektieren:

```typescript
// retail-prices/route.ts - NACH Migration
const latestPrices = await prisma.$queryRaw`
  SELECT DISTINCT ON (provider, product)
    date,
    provider,
    product,
    price_eur as "priceEur",
    price_usd as "priceUsd",  -- ✅ NOW EXISTS
    currency,                  -- ✅ NOW EXISTS
    fx_rate as "fxRate",       -- ✅ NOW EXISTS
    fine_oz as "fineOz",       -- ✅ NOW EXISTS
    implied_usd_oz as "impliedUsdOz",  -- ✅ NOW EXISTS
    premium_percent as "premiumPercent", -- ✅ NOW EXISTS
    source,                    -- ✅ NOW EXISTS
    source_url as "sourceUrl",
    verification_status as "verificationStatus", -- ✅ NOW EXISTS
    raw_excerpt as "rawExcerpt", -- ✅ NOW EXISTS
    fetched_at as "fetchedAt"
  FROM retail_prices
  ORDER BY provider, product, date DESC, fetched_at DESC
`;
```

### 3. Scraper mit Verification aktivieren
Die Retail Fetcher können dann `verificationStatus` setzen:

```typescript
// lib/fetchers/retail.ts
await prisma.retailPrice.upsert({
  where: { date_provider_product: { date, provider, product } },
  create: {
    date,
    provider,
    product,
    priceEur,
    sourceUrl: url,
    rawExcerpt: htmlSnippet.substring(0, 2000),
    verificationStatus: 'VERIFIED',  // ✅ NOW WORKS
    source: 'scraper',
  },
  // ...
});
```

---

## WORKAROUND (CURRENT)

**Commit 0ebe119** hat temporären Workaround deployed:
- Endpoints selektieren NUR existierende Spalten
- `verificationStatus` wird NICHT abgefragt
- Scraper kann neue Preise schreiben, aber nicht validieren

**Limitierung:**
- Keine Unterscheidung zwischen verified/unverified Preisen
- Keine Premium-Kalkulation
- Keine FX-Konvertierung

---

## ABNAHMEKRITERIEN

Nach Migration + Code-Update:

1. **Supabase SQL:**
   ```sql
   SELECT verification_status, count(*) 
   FROM retail_prices 
   GROUP BY verification_status;
   ```
   Sollte zeigen: `UNVERIFIED` (für alte Einträge), `VERIFIED` (für neue)

2. **API Test:**
   ```bash
   curl https://silber-ten.vercel.app/api/retail-prices | jq '.prices[0]'
   ```
   Sollte enthalten: `verificationStatus`, `priceUsd`, `rawExcerpt`

3. **Healthz Test:**
   ```bash
   curl https://silber-ten.vercel.app/api/healthz | jq '.sources.retail'
   ```
   Sollte enthalten: `verification_status: "VERIFIED"`

---

**NÄCHSTER SCHRITT:** Führe Migration SQL in Supabase aus, dann revert den Workaround-Code!
