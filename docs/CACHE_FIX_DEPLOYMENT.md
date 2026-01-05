# CACHE FIX & DATA INTEGRITY - Deployment Ready

## Status: ✅ IMPLEMENTIERT

**Datum:** 2026-01-05  
**Deployment:** Auf stabiles Deployment CQZhMaBrf / KRSJSSXBX  

---

## 🎯 Ziele erreicht

### 1. ✅ Cache komplett gekillt
- Alle Dashboard-API-Routes haben strikte No-Cache Headers
- `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
- `Pragma: no-cache`
- `export const dynamic = 'force-dynamic'`
- `export const revalidate = 0`

**Implementiert in:**
- [lib/headers.ts](lib/headers.ts) - Helper-Funktionen
- [app/api/dashboard-v2/route.ts](app/api/dashboard-v2/route.ts)
- [app/api/metal-prices/route.ts](app/api/metal-prices/route.ts)
- [app/api/retail-prices/route.ts](app/api/retail-prices/route.ts)
- [app/api/db-stats/route.ts](app/api/db-stats/route.ts)
- [app/api/debug/snapshot/route.ts](app/api/debug/snapshot/route.ts)

### 2. ✅ Refresh erzeugt KEINE Mock-Daten in Production
- Mock-Retail-Daten nur in `NODE_ENV !== 'production'`
- Production: Klare Fehler-Messages wenn Retail-Fetcher nicht implementiert
- NIEMALS Fantasiepreise schreiben
- Kein `source='mock'` oder `source='manual-test'` in Production

**Code:**
```typescript
// app/api/refresh/route.ts - Zeilen 275-330
if (process.env.NODE_ENV !== 'production') {
  // Mock-Daten NUR für Development
} else {
  // Production: Skip mit klarem Error
  errors.push('retail: Not yet implemented (no mock data in production)');
  sourceStatus.retail = 'unavailable';
}
```

### 3. ✅ Retail-Preise mit Verification Tracking
- Neue Felder in `retail_prices` Tabelle:
  - `raw_excerpt` - HTML/JSON Snippet mit Preis (max 2KB)
  - `verification_status` - 'VERIFIED', 'UNVERIFIED', 'FAILED'
- Migration: `prisma/migrations/20260105_retail_verification.sql`
- UI zeigt UNVERIFIED Badge wenn Parser unsicher

**Schema Update:**
```prisma
model RetailPrice {
  // ...
  sourceUrl           String?  @map("source_url")
  rawExcerpt          String?  @map("raw_excerpt")
  verificationStatus  String   @default("UNVERIFIED") @map("verification_status")
}
```

### 4. ✅ Auto-Backfill für historische Daten
- Automatischer Backfill wenn `metal_prices < 10 Zeilen` ODER `neuester Datensatz > 2 Tage alt`
- Lädt letzte 30 Tage von Stooq CSV (zuverlässig, kostenlos)
- Triggered bei jedem Dashboard-Load (async, non-blocking)
- Upsert-Safe: Überschreibt keine manuellen Daten

**Implementiert:**
- [lib/auto-backfill.ts](lib/auto-backfill.ts) - Auto-Backfill Logic
- [app/api/dashboard-v2/route.ts](app/api/dashboard-v2/route.ts) - Integration

**Code:**
```typescript
checkAndTriggerAutoBackfill().catch(err => {
  console.warn('[AUTO_BACKFILL_BACKGROUND_ERROR]', err);
});
```

### 5. ✅ Debug-Panel zeigt "Was wurde wirklich geschrieben?"
- Neue Sektion: "📝 Last Writes (letzte 5)"
- Zeigt letzte 5 Metal Prices (Datum, Preis, Source)
- Zeigt letzte 5 Retail Prices (mit Verification Status)
- Sofort sichtbar ob DB wirklich beschrieben wurde
- Verification-Badges: ⚠ UNVERIFIED, ✓ VERIFIED

---

## 📦 Neue/Geänderte Dateien

**Neue Dateien:**
1. `lib/headers.ts` - No-Cache Helper
2. `lib/auto-backfill.ts` - Auto-Backfill Logic
3. `prisma/migrations/20260105_retail_verification.sql` - Retail Verification Migration

**Geänderte Dateien:**
1. `prisma/schema.prisma` - retail_prices mit verification fields
2. `app/api/dashboard-v2/route.ts` - No-Cache + Auto-Backfill
3. `app/api/metal-prices/route.ts` - No-Cache
4. `app/api/retail-prices/route.ts` - No-Cache
5. `app/api/db-stats/route.ts` - No-Cache
6. `app/api/debug/snapshot/route.ts` - No-Cache + Last Writes
7. `app/api/refresh/route.ts` - Mock-Daten nur in Dev
8. `components/DebugPanel.tsx` - Last Writes Anzeige

---

## 🧪 Testing Checklist (nach Deployment)

### A) Migrations auf Supabase ausführen

**1. debug_events Tabelle (aus Phase 1):**
```sql
CREATE TABLE IF NOT EXISTS debug_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope TEXT NOT NULL,
  source TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debug_events_ts ON debug_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_debug_events_scope_source ON debug_events(scope, source);
CREATE INDEX IF NOT EXISTS idx_debug_events_level ON debug_events(level);
```

**2. retail_prices Verification Fields:**
```sql
ALTER TABLE retail_prices
ADD COLUMN IF NOT EXISTS raw_excerpt TEXT,
ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED';

CREATE INDEX IF NOT EXISTS idx_retail_prices_verification ON retail_prices(verification_status);
```

### B) Cache-Kill Test

1. Öffne Dashboard
2. Notiere Timestamp im Debug-Panel
3. Hard Refresh (Ctrl+Shift+R)
4. **✅ Erwartung:** Timestamp hat sich geändert
5. Klicke "Start (Refresh)"
6. **✅ Erwartung:** DB Stats ändern sich sofort

**Akzeptanzkriterium:** KEINE 3 Tage alten Werte mehr sichtbar

### C) No Mock in Production Test

1. Öffne Supabase → retail_prices Tabelle
2. **✅ Erwartung:** KEIN `source='mock'` oder `source='manual-test'`
3. Wenn Retail-Einträge vorhanden: Alle sollten `source_url` haben
4. **✅ Erwartung:** Alle Retail-Preise plausibel (keine €35 wenn real ~€80)

### D) Auto-Backfill Test

1. Leere `metal_prices` Tabelle (optional für Test):
   ```sql
   DELETE FROM metal_prices WHERE source = 'stooq-backfill';
   ```
2. Öffne Dashboard
3. Warte 5-10 Sekunden
4. Refresh Page
5. **✅ Erwartung:** `metal_prices` hat ~30 Zeilen
6. Check Debug-Panel → "Last Writes" zeigt Metal Prices mit `source='stooq-backfill'`

### E) Debug-Panel "Last Writes" Test

1. Öffne Debug-Panel (expand)
2. Scroll zu "📝 Last Writes"
3. **✅ Erwartung:** 
   - Letzte 5 Metal Prices sichtbar (Datum, Preis, Source)
   - Falls Retail vorhanden: Letzte 5 mit Verification Status
   - UNVERIFIED Einträge haben ⚠ Badge

### F) Verification Status Test

Wenn später echte Retail-Parser implementiert:
1. Parser soll `verificationStatus = 'VERIFIED'` setzen wenn sicher
2. Sonst `UNVERIFIED` mit `rawExcerpt` filled
3. UI zeigt ⚠ UNVERIFIED Badge
4. **✅ Akzeptanz:** Keine Fantasiepreise, immer mit Source-Link

---

## 🚀 Deployment Commands

```bash
# 1. Commit alle Änderungen
git add .
git commit -m "fix: Cache kill + No mock in prod + Auto-backfill + Verification

- No-Cache Headers in allen Dashboard-APIs
- Mock-Daten nur in Development
- Auto-Backfill für Metal Prices (30d Stooq)
- Retail verification_status + raw_excerpt fields
- Debug-Panel zeigt Last Writes (5 recent)
- Nie wieder alte gecachte Daten
- Nie wieder Fantasiepreise in Production"

# 2. Push zu GitHub
git push origin main

# 3. Vercel auto-deploys

# 4. Nach Deployment: Migrations auf Supabase
# (siehe oben: SQL Scripts)

# 5. Tests durchführen (siehe Checklist oben)
```

---

## 📊 Erwartete Verbesserungen

**Vorher:**
- ❌ UI zeigt 3 Tage alte Daten (Cache)
- ❌ Retail-Preise sind Mocks (€35 statt €80)
- ❌ Charts leer ohne manuelles Backfill
- ❌ Keine Ahnung was in DB wirklich steht

**Nachher:**
- ✅ UI zeigt IMMER frische DB-Daten
- ✅ Retail nur echt oder UNVERIFIED (kein Mock in Prod)
- ✅ Charts automatisch befüllt (30 Tage Historie)
- ✅ Debug-Panel zeigt exakt was geschrieben wurde
- ✅ Jede Zahl hat Herkunft (source_url + verification_status)

---

## 🔧 Technische Details

### No-Cache Implementation
```typescript
// lib/headers.ts
export function jsonResponseNoCache(data: any, status = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
```

### Auto-Backfill Trigger
```typescript
// Triggered on every dashboard load
checkAndTriggerAutoBackfill().catch(err => {
  console.warn('[AUTO_BACKFILL_BACKGROUND_ERROR]', err);
});
```

### Mock-Data Guard
```typescript
if (process.env.NODE_ENV !== 'production') {
  // Dev only: Mock-Daten
} else {
  // Production: Skip with clear error
  errors.push('retail: Not yet implemented (no mock data in production)');
  sourceStatus.retail = 'unavailable';
}
```

---

## ✅ Changelog

```
2026-01-05 - Cache Kill + Data Integrity Fix
  ✅ No-Cache Headers in allen Dashboard-APIs
  ✅ Mock-Daten nur in Development (NODE_ENV guard)
  ✅ Retail verification_status + raw_excerpt Felder
  ✅ Auto-Backfill für Metal Prices (Stooq 30d)
  ✅ Debug-Panel zeigt Last Writes (letzte 5)
  ✅ Build erfolgreich
  ✅ Prisma Client regeneriert
  ✅ Ready für Production Deployment
```

---

**Build Status:** ✅ Compiled successfully  
**Proofs:** Nach Deployment bereitstellen (Screenshots)
