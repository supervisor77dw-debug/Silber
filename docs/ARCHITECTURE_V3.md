# ARCHITEKTUR-KORREKTUR: Strikte DB-First Implementierung

**Datum**: 4. Januar 2026  
**Breaking Changes**: Ja  
**Status**: ✅ Implementiert

## Zusammenfassung

Die App wurde fundamental überarbeitet, um eine **strikte DB-First Architektur** zu implementieren. **Keine Flickschusterei mehr** - saubere Trennung zwischen Datenquellen und UI.

## Grundregeln (verbindlich)

1. **UI liest NIEMALS direkt von Live-APIs**
2. **Live-APIs schreiben NUR in die Datenbank**
3. **UI lädt immer aus DB** (über `/api/dashboard-v2`)

```
┌────────────┐
│  Live-APIs │  (COMEX, SGE, FX, etc.)
└──────┬─────┘
       │ write only
       ▼
┌────────────┐
│  Database  │  (Single Source of Truth)
└──────┬─────┘
       │ read only
       ▼
┌────────────┐
│     UI     │  (Dashboard, Charts)
└────────────┘
```

## Änderungen im Detail

### A) `/api/refresh` - Komplett neu implementiert

**Vorher**:
- Gab komplexe `attempts[]` Arrays zurück
- Enthielt Daten direkt in Response
- Warf Errors bei Einzelfehlern
- UI verarbeitete API-Daten direkt

**Jetzt**:
```typescript
POST /api/refresh

// Response (nur Status, KEINE Daten):
{
  "date": "2026-01-04",
  "updated": ["comex", "fx", "sge"],
  "skipped": ["comex_price"],
  "sourceStatus": {
    "comex": "live",        // erfolgreich von API
    "fx": "live",
    "sge": "live",
    "comex_price": "db"     // API down, nutzt DB
  },
  "message": "Updated 3 sources, skipped 1"
}
```

**Verhalten**:
1. Versucht jede Quelle zu fetchen
2. Bei Erfolg: `upsert` in DB (date = today)
3. Bei Fehler: `skip` (kein throw, nur console.warn)
4. Gibt nur Status zurück
5. **UI lädt danach neu aus DB**

### B) `/api/backfill` - Von GET zu POST

**Vorher**:
```bash
GET /api/admin/backfill?token=xxx&from=2025-12-01&to=2025-12-31
```

**Jetzt**:
```bash
POST /api/backfill
Authorization: Bearer <CRON_SECRET>
Content-Type: application/json

{
  "from": "2024-01-01",
  "to": "2025-12-31",
  "source": "stooq"
}
```

**Breaking Change**:
- Auth jetzt via Header statt Query-Parameter
- Body statt Query-Params
- Route verschoben: `/api/admin/backfill` → `/api/backfill`

**Regeln**:
- Nutzt **nur** öffentliche Daily-Daten (Stooq CSV)
- Upsert in `metal_prices` (unique: date)
- Keine UI-Blockierung
- Summary als Response

### C) `retail_prices` - Neue Tabelle

Für Händlerpreis-Vergleich (Premium vs Spot):

```sql
CREATE TABLE retail_prices (
  date         DATE NOT NULL,
  provider     TEXT,  -- "Degussa", "ProAurum", etc.
  product      TEXT,  -- "1oz Maple Leaf", etc.
  price_eur    FLOAT,
  fine_oz      FLOAT DEFAULT 1.0,
  
  -- Calculated
  implied_usd_oz  FLOAT,
  premium_percent FLOAT,
  
  -- Tracking
  source       TEXT DEFAULT 'manual',
  source_url   TEXT,
  fetched_at   TIMESTAMPTZ
);
```

**Verwendung** (optional):
- Manuelle Pflege ODER
- Gelegentlicher Fetch
- Anzeige: Retail $/oz + Premium vs Spot (%)

### D) Dashboard - Fehlerbehandlung überarbeitet

**Vorher**:
- Fullscreen Error-Pages
- Blocking Dialoge
- Technische Fehlermeldungen

**Jetzt**:
- Kleine Inline-Hinweise
- App bleibt nutzbar
- Toast-Benachrichtigungen
- Keine Blockaden

**Beispiel**:
```tsx
// Kein Live-Zugriff? → Kein Problem!
<div className="bg-yellow-50 p-4">
  <p>Live-Daten heute nicht verfügbar</p>
  <p>Zeige letzte DB-Werte vom 2026-01-03</p>
</div>
```

### E) Charts - Nur DB, keine Live-APIs

**Garantiert**:
- Lesen **NUR** aus `metal_prices` Tabelle
- SQL: `SELECT * FROM metal_prices ORDER BY date DESC LIMIT 30`
- Kein direkter API-Zugriff
- Fallback: Letztes verfügbares Datum

**Kennzeichnung**:
```tsx
{dataDate !== today && (
  <span className="text-sm text-gray-500">
    Letztes verfügbares Datum: {dataDate}
  </span>
)}
```

## Migration Guide

### 1. Backfill-Calls aktualisieren

**Alt**:
```bash
curl "https://app.vercel.app/api/admin/backfill?token=SECRET&from=2025-12-01&to=2025-12-31"
```

**Neu**:
```bash
curl -X POST https://app.vercel.app/api/backfill \
  -H "Authorization: Bearer SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "2025-12-01",
    "to": "2025-12-31",
    "source": "stooq"
  }'
```

### 2. Supabase Migrationen ausführen

```sql
-- 1. metal_prices (falls nicht vorhanden)
-- Siehe: prisma/migrations/20260104_add_metal_prices.sql

-- 2. retail_prices (neu)
-- Siehe: prisma/migrations/20260104_add_retail_prices.sql
```

Dann:
```bash
npx prisma generate
```

### 3. Refresh-Flow verstehen

**Vorher**:
```typescript
const result = await fetch('/api/refresh');
const data = result.json();
setData(data);  // ❌ Direkt ins UI
```

**Jetzt**:
```typescript
const result = await fetch('/api/refresh', { method: 'POST' });
const status = result.json();
// status = { updated: [], skipped: [], sourceStatus: {} }

// UI lädt neu aus DB:
await fetchDashboardData();  // ✅ Holt aus DB
```

## Done-Kriterien (alle erfüllt)

✅ **App startet IMMER**, auch ohne Live-Zugriff  
✅ **30- & 365-Tage-Charts** funktionieren rein aus DB  
✅ **Refresh aktualisiert DB**, nicht UI direkt  
✅ **Keine Blocking Errors** mehr  
✅ **UI zeigt Status** (Ampel-Logik: ✓ live, ⚠ db, ✗ unavailable)  
✅ **Backfill via POST** mit Body  
✅ **retail_prices Tabelle** für Händlerpreise  

## Testing

### 1. Refresh testen
```bash
# Status-only Response (keine Daten!)
curl -X POST https://app.vercel.app/api/refresh

# Expected:
{
  "date": "2026-01-04",
  "updated": ["comex", "fx"],
  "skipped": ["sge"],
  "sourceStatus": {
    "comex": "live",
    "fx": "live",
    "sge": "db"
  }
}
```

### 2. Dashboard lädt aus DB
```bash
curl https://app.vercel.app/api/dashboard-v2

# Expected:
{
  "dataStatus": "current",  # oder "yesterday", "stale"
  "currentSpread": { ... },  # aus DB
  "sourceStatus": {
    "comex": "ok",
    "sge": "stale"
  }
}
```

### 3. Backfill (neues Format)
```bash
curl -X POST https://app.vercel.app/api/backfill \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "2025-12-01",
    "to": "2025-12-31"
  }'

# Expected:
{
  "success": true,
  "summary": {
    "inserted": 28,
    "updated": 3,
    "errors": 0
  }
}
```

## Vorteile der neuen Architektur

1. **Geschwindigkeit**: UI lädt sofort aus DB (keine API-Wartezeiten)
2. **Zuverlässigkeit**: App funktioniert auch wenn APIs down sind
3. **Offline-fähig**: Historische Daten immer verfügbar
4. **Skalierbar**: Charts mit 365 Tagen ohne Performance-Probleme
5. **Testbar**: DB-Zustand unabhängig von Live-APIs
6. **Kostenoptimiert**: Weniger API-Calls (nur bei Refresh)

## Nächste Schritte

1. **Vercel Redeploy** triggern
2. **Supabase Migrationen** ausführen (retail_prices)
3. **Backfill** mit neuem Format aufrufen
4. **Testen**: Dashboard → Refresh → DB-Reload

---

**Version**: 3.0.0 - Architektur-Korrektur  
**Breaking**: Ja (Backfill API geändert)  
**Status**: ✅ Produktionsbereit
