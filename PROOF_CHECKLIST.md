# 🔴 PROOF CHECKLIST - Keine Interpretation, nur Fakten

**Build**: 5edb0e0  
**Deployed**: Vercel (1-2 Min warten)

## SCHRITT 1: ROUTING ✅

```bash
# Prüfe Dateien
ls app/api/refresh/route.ts  # ✅ Existiert
ls app/api/backfill/route.ts # ✅ Existiert
```

**Beide enthalten:**
- ✅ `export const runtime = 'nodejs';`
- ✅ `export async function POST(req: NextRequest)`
- ❌ KEIN GET
- ❌ KEIN Edge Runtime

## SCHRITT 2: BEWEIS - Route wird deployed

```bash
# Test 1: Refresh aufrufen
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer silver-cron-prod-2026"
```

**Dann SOFORT in Vercel Logs prüfen:**

1. Gehe zu: https://vercel.com/dashboard → Project → Deployments → Latest → Functions
2. Suche nach: `[API HIT]`

**ERGEBNIS:**
- ✅ `[API HIT]` gefunden → Route ist deployed
- ❌ `[API HIT]` NICHT gefunden → **Route wird NICHT deployed** (Stop! Falsches Branch/Projekt/Cache)

**Wenn 405 kommt ABER kein [API HIT]:**
→ Route existiert nicht im Deployment  
→ Vercel nutzt altes Deployment  
→ Oder falsches Projekt

## SCHRITT 3: DB REALITÄT - Schreibt der Code?

**Nach dem curl von Schritt 2, prüfe Vercel Logs:**

Suche nach: `[DB WRITE]`

**Expected:**
```
[DB WRITE] { table: 'metal_prices', date: '2026-01-04', value: 31.5 }
```

**Dann SOFORT in Supabase SQL Editor:**

```sql
-- Test 1: Gibt es überhaupt Daten?
SELECT COUNT(*) FROM metal_prices;

-- Test 2: Was wurde geschrieben?
SELECT date, xag_usd_close, source, fetched_at 
FROM metal_prices 
ORDER BY date DESC 
LIMIT 10;

-- Test 3: Zeitbereich
SELECT MIN(date), MAX(date) FROM metal_prices;
```

**ERGEBNIS:**
- ✅ COUNT > 0 → Code schreibt
- ❌ COUNT = 0 → **Code schreibt NICHT** (Stop! DB-Problem oder Code-Bug)

## SCHRITT 4: BACKFILL isoliert (ohne COMEX)

```bash
# Backfill 30 Tage historische Daten
curl -X POST https://silber-ten.vercel.app/api/backfill \
  -H "Authorization: Bearer silver-cron-prod-2026" \
  -H "Content-Type: application/json" \
  --data '{"from":"2025-12-01","to":"2025-12-31","sources":["metal"]}'
```

**Expected Response:**
```json
{
  "ok": true,
  "wrote": {
    "metal": 23  // ~23 Handelstage im Dezember
  },
  "skippedDays": 0,
  "sourceStatus": {
    "metal": "live"
  }
}
```

**Vercel Logs MÜSSEN zeigen:**
```
[API HIT] 2026-01-04T...
[Backfill] 2025-12-01 to 2025-12-31
[Backfill] Parsed 2500 rows from CSV
[Backfill] 23 rows in range
[DB WRITE] { table: 'metal_prices', date: '2025-12-01', value: 30.5 }
[DB WRITE] { table: 'metal_prices', date: '2025-12-02', value: 30.7 }
...
[Backfill] Done: 23 inserted, 0 updated, 0 errors
```

**Dann Supabase:**
```sql
SELECT COUNT(*) FROM metal_prices WHERE date >= '2025-12-01' AND date <= '2025-12-31';
-- Expected: ~23
```

**ERGEBNIS:**
- ✅ wrote.metal >= 20 UND COUNT >= 20 → Backfill funktioniert
- ❌ wrote.metal = 0 ODER COUNT = 0 → **Backfill schreibt nicht**

## SCHRITT 5: UI liest aus DB

**Supabase - Daten prüfen:**
```sql
SELECT COUNT(*) FROM metal_prices;
-- Sollte > 30 sein nach Backfill
```

**Browser:**
1. Öffne: https://silber-ten.vercel.app
2. Öffne DevTools Console (F12)
3. Suche nach: `[UI DATA]`

**Expected:**
```
[UI DATA] { rows: 30, minDate: '2025-12-01', maxDate: '2026-01-04' }
```

**Chart prüfen:**
- ✅ Chart zeigt 30-Tage Verlauf → UI liest DB
- ❌ Chart leer OBWOHL DB hat Daten → **UI liest NICHT aus DB**

## SCHRITT 6: COMEX Best Effort

**Test: COMEX API down simulieren**

Vercel Logs nach Refresh zeigen entweder:

**Success:**
```
[FETCH_COMEX_PRICE_START]
[FETCH_COMEX_PRICE_OK] 31.50
[DB WRITE] { table: 'metal_prices', ... }
```

**Oder Timeout/Failure:**
```
[FETCH_COMEX_PRICE_START]
[FETCH_COMEX_PRICE_FAIL] Timeout after 8s
```

**Response bei Failure:**
```json
{
  "ok": true,  // ✅ NICHT false!
  "wrote": {
    "retail": 2,
    "metal": 0  // Kein COMEX heute
  },
  "errors": ["comex_price: Timeout after 8s"],
  "sourceStatus": {
    "comex_price": "db"  // Nutzt DB-Fallback
  }
}
```

**WICHTIG:**
- ✅ `ok: true` trotz COMEX failure
- ✅ Refresh läuft weiter
- ✅ UI zeigt alte DB-Daten
- ❌ NIEMALS 500 Error
- ❌ NIEMALS UI-Block

## SCHRITT 7: AKZEPTANZKRITERIEN

**Alle müssen ✅ sein:**

| # | Kriterium | Test | Status |
|---|-----------|------|--------|
| 1 | POST /api/refresh → kein 405 | curl → 200/401 (nicht 405) | ⏳ |
| 2 | POST /api/backfill → schreibt Daten | wrote.metal >= 20 | ⏳ |
| 3 | metal_prices enthält >30 Tage | SELECT COUNT(*) | ⏳ |
| 4 | UI zeigt Verlauf (Chart) | Browser → Chart sichtbar | ⏳ |
| 5 | retail_prices enthält Daten | SELECT COUNT(*) | ⏳ |
| 6 | COMEX-Ausfall blockiert nicht | ok:true + errors[] | ⏳ |
| 7 | Logs belegen ALLES | [API HIT], [DB WRITE] | ⏳ |

## SCHRITT 8: VERBOTEN

❌ "Bei mir funktioniert es lokal"  
❌ "Vercel cached vielleicht"  
❌ "Sollte eigentlich gehen"  
❌ "Edge vs Node ist egal"  

✅ Nur Logs + DB + UI zählen

---

## QUICK TESTS (Copy-Paste)

```bash
# Test 1: Refresh
curl -X POST https://silber-ten.vercel.app/api/refresh -H "Authorization: Bearer silver-cron-prod-2026" && echo "\n✅ Refresh Response"

# Test 2: Backfill
curl -X POST https://silber-ten.vercel.app/api/backfill -H "Authorization: Bearer silver-cron-prod-2026" -H "Content-Type: application/json" --data '{"from":"2025-12-01","to":"2025-12-31","sources":["metal"]}' && echo "\n✅ Backfill Response"

# Test 3: Health
curl https://silber-ten.vercel.app/api/health && echo "\n✅ Health Response"
```

```sql
-- Supabase Quick Check
SELECT 
  'metal_prices' as table_name, 
  COUNT(*) as total_rows,
  MIN(date) as oldest,
  MAX(date) as newest
FROM metal_prices
UNION ALL
SELECT 
  'retail_prices',
  COUNT(*),
  MIN(date),
  MAX(date)
FROM retail_prices;
```

## NÄCHSTE SCHRITTE

1. Warte 1-2 Min (Vercel Deploy)
2. Führe QUICK TESTS aus
3. Prüfe Vercel Logs für `[API HIT]` und `[DB WRITE]`
4. Prüfe Supabase SQL für COUNT
5. Fülle Checklist aus
6. **Nur wenn ALLE ✅ → Done**
