# FORENSIC VERIFICATION GUIDE

**Deployment:** CQZhMaBrf (production)  
**Commit:** 6bc9169  
**Date:** 2026-01-06

## ZWECK

Dieser Guide zeigt dir, wie du **BEWEISE** sammelst, dass:
1. Die richtige Datenbank abgefragt wird
2. Refresh wirklich neue Daten fetched und schreibt
3. UI echte Daten aus DB zeigt (kein hardcoded "2026-01-02")

---

## 1. DB CONNECTION PROOF (Welche Datenbank?)

### /api/healthz abrufen

```bash
curl https://silber-ten.vercel.app/api/healthz | jq
```

**Erwartete Response:**

```json
{
  "timestamp": "2026-01-06T...",
  "db": {
    "connected": true,
    "info": {
      "db": "postgres",
      "schema": "public",
      "host": "aws-0-eu-central-1.pooler.supabase.com",
      "version": "PostgreSQL 15.6..."
    }
  },
  "sources": {
    "metal": {
      "count_last_30d": 17,
      "latest_date": "2025-12-09",
      "status": "stale"
    },
    "sge": {
      "count_last_30d": 4,
      "latest_date": "2026-01-02",
      "status": "stale"
    }
  },
  "overall": "degraded"
}
```

**PROOF PUNKTE:**
- ✅ `db.info.host` zeigt Supabase Host (nicht localhost)
- ✅ `db.info.db` zeigt den DB-Namen
- ✅ `sources.metal.latest_date` zeigt echtes Datum aus DB
- ✅ `overall: "degraded"` weil Daten veraltet sind

---

## 2. REFRESH BUTTON PROOF (Schreibt wirklich in DB?)

### A) VOR Refresh: Notiere aktuelle Daten

```bash
curl https://silber-ten.vercel.app/api/db-stats | jq '.stats.metal_prices.latest'
```

**Erwartete Ausgabe:**
```json
{
  "date": "2025-12-09",
  "price": 32.89,
  "source": "backfill",
  "fetchedAt": "2026-01-04T..."
}
```

### B) Trigger Refresh (UI Button ODER API direkt)

**Option 1: UI Button**
1. Gehe zu https://silber-ten.vercel.app
2. Öffne Browser DevTools → Network Tab
3. Klicke auf "Aktualisieren" Button
4. Siehe POST Request zu `/api/refresh`

**Option 2: API direkt**
```bash
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer $NEXT_PUBLIC_REFRESH_TOKEN" \
  | jq
```

**Erwartete Response:**
```json
{
  "ok": true,
  "date": "2026-01-06",
  "updated": ["comex", "fx", "metal", "sge", "spread"],
  "skipped": ["retail"],
  "sourceStatus": {
    "comex": "live",
    "fx": "live",
    "metal": "live"
  },
  "wrote": {
    "metal": 1,
    "retail": 0
  },
  "duration_ms": 4523,
  "message": "Updated 5 sources, skipped 1"
}
```

### C) NACH Refresh: Prüfe ob Daten aktualisiert wurden

```bash
curl https://silber-ten.vercel.app/api/db-stats | jq '.stats.metal_prices.latest'
```

**Erwartete Änderungen:**
- ✅ `date` sollte auf heute (2026-01-06) stehen
- ✅ `fetchedAt` sollte aktueller Timestamp sein
- ✅ `source` sollte "live-api" sein (nicht "backfill")

---

## 3. VERCEL LOGS (Server-seitige Beweise)

### A) Gehe zu Vercel Dashboard

1. https://vercel.com/supervisor77dw-debugs-projects/silver
2. Deployment `CQZhMaBrf` → "Logs" Tab
3. Wähle "All Logs" (nicht nur Errors)

### B) Suche nach Forensic Logs

**Nach /api/healthz Aufruf:**
```
[API /healthz] DB_QUERY: {
  db: { db: 'postgres', schema: 'public', host: '...' },
  overall: 'degraded',
  sources: [
    { name: 'metal', status: 'stale', count_30d: 17, latest_date: '2025-12-09' },
    { name: 'sge', status: 'stale', count_30d: 4, latest_date: '2026-01-02' }
  ],
  queryMs: 234,
  timestamp: '2026-01-06T...'
}
```

**Nach /api/refresh Aufruf:**
```
[API /refresh] POST_START: {
  timestamp: '2026-01-06T10:30:00.000Z',
  url: 'https://silber-ten.vercel.app/api/refresh',
  headers: { authorization: 'Bearer ***', ... }
}
[FETCH_COMEX_PRICE_START]
[API /refresh] POST_COMPLETE: {
  duration_ms: 4523,
  updated: ['comex', 'fx', 'metal', 'sge', 'spread'],
  skipped: ['retail'],
  wrote: { retail: 0, metal: 1 },
  timestamp: '2026-01-06T10:30:04.523Z'
}
```

**Nach /api/metal-prices Aufruf:**
```
[API /metal-prices] DB_QUERY: {
  table: 'metal_prices',
  db: { db: 'postgres', schema: 'public', host: '...' },
  where: "date >= '2025-12-07'",
  orderBy: 'date ASC',
  rowCount: 1,
  minDate: '2026-01-06',
  maxDate: '2026-01-06',
  queryMs: 145,
  timestamp: '2026-01-06T10:30:05.000Z'
}
```

**PROOF PUNKTE:**
- ✅ Logs zeigen echte DB Connection (host, db, schema)
- ✅ `POST_COMPLETE` zeigt `wrote.metal: 1` → 1 row geschrieben
- ✅ Query danach zeigt neues `maxDate: '2026-01-06'`

---

## 4. UI PROOF (Zeigt echte Daten, kein hardcoded)

### A) Öffne UI
1. https://silber-ten.vercel.app
2. Öffne DevTools → Console Tab

### B) Suche nach healthz Log
```
[Dashboard] healthz loaded: {
  overall: 'degraded',
  sources: {
    metal: { latest_date: '2025-12-09', status: 'stale' }
  }
}
```

### C) Prüfe UI Elemente

**Header "Daten vom":**
- VOR Refresh: "Daten vom: 2025-12-09" (aus healthz)
- NACH Refresh: "Daten vom: 2026-01-06" (aktualisiert)

**Status Badge:**
- VOR Refresh: `⚠ Veraltet` (gelb)
- NACH Refresh: `✓ Aktuell` (grün)

**DB Stats Panel (rechts oben):**
- Zeigt `📊 DB Live Stats (postgres)` → DB-Name aus healthz
- Zeigt `DB: postgres@aws-0-eu-central-1...` → Connection proof

---

## 5. ROOT CAUSE ANALYSE

### Wenn Refresh NICHT funktioniert:

**A) Check Auth Token:**
```bash
# In Vercel Environment Variables
NEXT_PUBLIC_REFRESH_TOKEN=<dein-token>
```

**B) Check Vercel Logs für Fehler:**
- Suche nach `[REFRESH_AUTH_FAIL]`
- Suche nach `[Refresh] COMEX skip:` oder `[Refresh] FX skip:`

**C) Check Fetcher Failures:**
- Gehe zu Vercel Logs
- Suche nach Stack Traces in Refresh-Logs
- Mögliche Ursachen:
  - API Rate Limits (metals-api, ECB, COMEX)
  - Network Timeouts (SGE China firewall)
  - Schema Mismatches (fetchSgePrice expects usdCnyRate)

**D) Check DB Write Permissions:**
```sql
-- In Supabase SQL Editor
SELECT * FROM metal_prices ORDER BY fetched_at DESC LIMIT 5;
```
- Wenn `fetched_at` alt → Writes schlagen fehl
- Check Supabase Logs für Permission Errors

---

## 6. ABNAHMEKRITERIEN (ERFÜLLT?)

Nach Klick auf "Aktualisieren":

- [ ] `/api/healthz` zeigt `metal.latest_date >= heute-1`
- [ ] `/api/healthz` zeigt `metal.count_last_30d > 15`
- [ ] `/api/db-stats` zeigt `metal_prices.latest.date = heute`
- [ ] Vercel Logs zeigen `[API /refresh] POST_COMPLETE: { wrote: { metal: 1 } }`
- [ ] UI Header zeigt "Daten vom: 2026-01-06" (kein hardcoded "2026-01-02")
- [ ] UI Status Badge zeigt "✓ Aktuell" (grün)
- [ ] DB Stats Panel zeigt korrekten DB-Host

---

## NÄCHSTE SCHRITTE (wenn alles klappt)

1. **Migration ausführen:**
   ```sql
   -- In Supabase SQL Editor
   -- Inhalt von prisma/migrations/20260106_fetch_runs_observability.sql
   ```

2. **Vercel Cron konfigurieren:**
   ```json
   // vercel.json
   {
     "crons": [{
       "path": "/api/cron/fetch-data",
       "schedule": "0 */1 * * *"
     }]
   }
   ```

3. **Test Auto-Refresh:**
   - Warte 1 Stunde
   - Check Vercel Logs für `[CRON]` Einträge
   - Check `/api/healthz` für neue Daten

---

## TROUBLESHOOTING

### Problem: UI zeigt immer noch "2026-01-02"

**Ursache:** Browser cached alte Version  
**Lösung:** Hard Refresh (Ctrl+Shift+R) oder Incognito Mode

### Problem: Refresh gibt 401 Unauthorized

**Ursache:** `NEXT_PUBLIC_REFRESH_TOKEN` nicht gesetzt  
**Lösung:** Check Vercel Environment Variables

### Problem: Refresh skipped alle Quellen

**Ursache:** Live-APIs nicht erreichbar (Wochenende, Rate Limit)  
**Lösung:** Normal! Retry später oder check API-Status

### Problem: DB zeigt neue Daten, aber UI nicht

**Ursache:** `fetchDashboardData()` cached Antwort  
**Lösung:** Check dass `{ cache: 'no-store' }` gesetzt ist

---

**FRAGEN?** Check Vercel Logs zuerst. Alle Endpoints loggen jetzt forensisch!
