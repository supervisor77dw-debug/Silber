# Phase 1 - Debug Console Implementation

**Status:** ✅ COMPLETED  
**Datum:** 2026-01-05

## Ziel

Implementierung einer "Single Source of Truth" Debug Console, die IMMER sichtbar ist und den kompletten System-Status zeigt, unabhängig davon, ob die DB leer ist oder Fehler auftreten.

## Implementierte Änderungen

### 1. Datenbank

**Neue Tabelle: `debug_events`**
- Datei: `prisma/migrations/20260105_debug_events.sql`
- Prisma Model: `DebugEvent` in `schema.prisma`
- Spalten:
  - `id` (UUID)
  - `ts` (Timestamp mit Zeitzone)
  - `scope` (refresh/backfill/ui/api)
  - `source` (fx/sge/comex/retail/metal/db)
  - `level` (info/warn/error)
  - `message` (Text)
  - `meta` (JSONB für zusätzliche Daten)
  - `created_at` (Timestamp)

### 2. Backend API

**Neuer Endpoint: `/api/debug/snapshot`** (GET)
- Datei: `app/api/debug/snapshot/route.ts`
- Liefert:
  - **deployment**: env, commit hash, region, timestamp
  - **dbStats**: counts + min/max date für alle Tabellen
  - **sourceHealth**: Status jeder Datenquelle (ok/empty/fail)
  - **lastRefresh**: letzter Refresh mit Timestamp + wrote counts
  - **lastErrors**: letzte 10 Fehler aus debug_events
- Funktioniert auch wenn `debug_events` Tabelle noch nicht existiert (graceful degradation)

### 3. UI Komponenten

**Neue Komponente: `DebugPanel`**
- Datei: `components/DebugPanel.tsx`
- Features:
  - Immer sichtbar (oben im Dashboard)
  - Expandable/Collapsible
  - Zeigt Deployment Info
  - DB Stats mit counts + Datumsbereichen
  - Source Health Badges (✓ OK, ⚠ LEER, ✗ FAIL)
  - Last Refresh Info mit Details
  - Last Errors Liste (letzte 10)
  - Action Buttons: "Start (Refresh)" + optional "Backfill 30 Tage"
  - Responsive Design mit Dark Mode Support

**Dashboard Update**
- Datei: `components/Dashboard.tsx`
- Änderungen:
  - Import `DebugPanel`
  - Neuer State: `debugSnapshot`
  - Neue Funktion: `fetchDebugSnapshot()`
  - DebugPanel wird in ALLEN States gerendert:
    - ✅ Bei normalem Betrieb
    - ✅ Bei leerem DB State
    - ✅ Bei Error State
  - Button "Daten abrufen" entfernt aus Empty State (→ nutze DebugPanel Button)

## UI-Regel erfüllt

✅ **Dashboard ist NIEMALS ein "dead end"**
- Bei leerer DB: Debug-Panel zeigt Status + "DB LEER" Badge
- Bei Fehler: Debug-Panel + Error Message mit Details
- Immer bedienbar durch "Start (Refresh)" Button im Debug-Panel

## Datenregel erfüllt

✅ **UI liest NUR aus DB**
- `/api/debug/snapshot` liest aus DB
- Keine Live-API-Calls im Debug Endpoint
- Wenn `debug_events` nicht existiert: graceful fallback

## Nächste Schritte (Phase 2)

1. Debug Logging in DB einbauen
2. Alle API-Routen mit konsequenten Logs ausstatten
3. Start/Ende/Fehler mit meta Daten loggen

## Deployment Notes

**Migration auf Production:**
```sql
-- Manuell auf Supabase ausführen:
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

**Oder via Prisma:**
```bash
npx prisma db push
```

## Testing Checklist

- [ ] GET `/api/debug/snapshot` liefert JSON (Browser testbar)
- [ ] Debug-Panel sichtbar im Dashboard
- [ ] Debug-Panel zeigt "DB LEER" bei leerer DB
- [ ] Debug-Panel zeigt deployment info (env, commit, region)
- [ ] Debug-Panel zeigt DB Stats für alle Tabellen
- [ ] Debug-Panel zeigt Source Health Badges
- [ ] "Start (Refresh)" Button funktioniert
- [ ] Debug-Panel bleibt sichtbar bei Fehler
- [ ] Debug-Panel bleibt sichtbar bei leerem State

## Files Changed

1. `prisma/schema.prisma` - DebugEvent Model hinzugefügt
2. `prisma/migrations/20260105_debug_events.sql` - Migration erstellt
3. `app/api/debug/snapshot/route.ts` - Neuer Endpoint
4. `components/DebugPanel.tsx` - Neue Komponente
5. `components/Dashboard.tsx` - Integration des DebugPanels

## Changelog

- ✅ debug_events Tabelle erstellt
- ✅ GET /api/debug/snapshot implementiert
- ✅ DebugPanel Komponente erstellt
- ✅ Dashboard integriert DebugPanel
- ✅ UI zeigt immer Status, auch bei leerem/Error State
- ✅ Prisma Client regeneriert
