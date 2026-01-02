# DB-First Architecture - Implementierungsdokumentation

## Überblick

Die App wurde komplett umgebaut auf eine **DB-First Architektur**:
- **Startup**: Lädt IMMER sofort aus der Datenbank (keine Wartezeiten)
- **Live-Daten**: Optional im Hintergrund, nie blockierend
- **Fehlerbehandlung**: Graceful degradation mit Fallback-Chains
- **User Feedback**: Toast-Benachrichtigungen statt Popups

## Neue Endpunkte

### 1. `/api/admin/backfill` (GET)
**Zweck**: Historische Silberpreise von Stooq CSV importieren

**Auth**: Benötigt `CRON_SECRET` als Query-Parameter

**Verwendung**:
```bash
# Dezember 2025 (Default)
GET /api/admin/backfill?token=YOUR_CRON_SECRET

# Expliziter Zeitraum
GET /api/admin/backfill?token=YOUR_CRON_SECRET&from=2025-12-01&to=2025-12-31

# Rolling 365 Tage
GET /api/admin/backfill?token=YOUR_CRON_SECRET&months=12
```

**Datenquelle**: 
- Stooq (kostenlos, kein API-Key): `https://stooq.com/q/d/l/?s=xagusd&i=d`
- Format: CSV mit Date, Open, High, Low, Close, Volume
- Validierung: Preise müssen zwischen 10-200 USD/oz liegen

**Speicherung**:
- Tabelle: `metal_prices`
- Unique Key: `date`
- Upsert: Aktualisiert existierende Einträge

**Response**:
```json
{
  "success": true,
  "summary": {
    "timeRange": { "from": "2025-12-01", "to": "2025-12-31" },
    "totalRows": 250,
    "filteredRows": 31,
    "inserted": 28,
    "updated": 3,
    "errors": 0
  },
  "message": "Backfill abgeschlossen: 28 neu, 3 aktualisiert, 0 Fehler"
}
```

---

### 2. `/api/refresh` (POST)
**Zweck**: Manueller Live-Datenabruf mit Fallback-Chains

**Auth**: Keine (öffentlich, für UI Refresh-Button)

**Verwendung**:
```bash
POST /api/refresh
```

**Ablauf**:
1. **COMEX Stocks**: Live → letzter DB-Wert → Error (kein Default)
2. **FX Rate**: Live → letzter DB-Wert → Error
3. **COMEX Price**: Live → letzter DB-Wert → Error
4. **SGE Price**: Live → letzter DB-Wert → Error (benötigt FX Rate)
5. **Spread Berechnung**: Nur wenn alle Daten vorhanden

**Response**:
```json
{
  "success": true,
  "timestamp": "2026-01-02T12:00:00.000Z",
  "summary": {
    "successful": 3,
    "unavailable": 1,
    "failed": 0,
    "total": 5,
    "spreadCalculated": true,
    "hasErrors": false,
    "partialSuccess": true
  },
  "attempts": [
    {
      "source": "COMEX Stocks",
      "status": "success",
      "timestamp": "2026-01-02T12:00:00.000Z",
      "message": "50.2M oz registered",
      "value": { ... }
    },
    {
      "source": "FX Rate",
      "status": "unavailable",
      "timestamp": "2026-01-02T12:00:01.000Z",
      "message": "Live nicht verfügbar - nutze DB-Wert vom 2026-01-01: 7.2450",
      "error": "ECB API timeout",
      "value": 7.2450
    }
    // ... weitere Attempts
  ],
  "message": "Teilweise erfolgreich: 3 live, 1 aus DB, 0 fehlgeschlagen"
}
```

**Fehlerbehandlung**:
- **Immer 200 Status** (auch bei Teil-Fehlern)
- `status`: `success` | `unavailable` | `failed`
- Bei `unavailable`: Letzter DB-Wert wird verwendet
- Bei `failed`: Quelle komplett nicht verfügbar

---

### 3. `/api/dashboard-v2` (GET)
**Zweck**: DB-First Dashboard-Daten (kein Live-Fetch)

**Verwendung**:
```bash
GET /api/dashboard-v2
```

**Response**:
```json
{
  "isEmpty": false,
  "dataStatus": "current",  // "current" | "yesterday" | "stale"
  "dataDate": "2026-01-02",
  "daysSinceUpdate": 0,
  "currentSpread": { ... },
  "currentStock": { ... },
  "lastFetch": { ... },
  "trends": { ... },
  "sourceStatus": {
    "comex": "ok",      // "ok" | "stale" | "unavailable"
    "sge": "ok",
    "fx": "stale",
    "comexPrice": "ok"
  }
}
```

**dataStatus Logik**:
- `current`: Daten von heute
- `yesterday`: Daten von gestern
- `stale`: Daten älter als 1 Tag (zeigt `daysSinceUpdate`)

**Empty State**:
- `isEmpty: true` wenn keine Daten
- Gibt Empfehlungen für ersten Datenabruf

---

## Frontend-Änderungen

### Dashboard Component

**Neuer Refresh-Button** (rechts oben):
```tsx
<button onClick={handleRefresh} disabled={refreshing}>
  <ArrowPathIcon className={refreshing ? 'animate-spin' : ''} />
  <span>{refreshing ? 'Lädt...' : 'Aktualisieren'}</span>
</button>
```

**Status-Badges**:
```tsx
{dataStatus === 'current' && <span className="badge-green">✓ Aktuell</span>}
{dataStatus === 'yesterday' && <span className="badge-yellow">⚠ Gestern</span>}
{dataStatus === 'stale' && <span className="badge-orange">⚠ {daysSinceUpdate} Tage alt</span>}
```

**Toast-Benachrichtigungen**:
```tsx
// Erfolg
toast.success('Alle Datenquellen erfolgreich aktualisiert', '4 Quellen live abgerufen');

// Warnung (Teil-Erfolg)
toast.warning('Teilweise erfolgreich: 3 live, 1 aus DB', 'Zeige verfügbare Daten');

// Fehler
toast.error('Keine Live-Daten verfügbar', 'Zeige letzte gespeicherte Werte');

// Info
toast.info('Daten sind 2 Tage alt', 'Klicken Sie auf "Aktualisieren"');
```

**Toast Auto-Dismiss**: Nach 5 Sekunden automatisch ausblenden

---

## Database Schema

### Neue Tabelle: `metal_prices`

```sql
CREATE TABLE metal_prices (
  id              TEXT PRIMARY KEY DEFAULT cuid(),
  date            DATE UNIQUE NOT NULL,
  
  -- Silver spot price (main field)
  xag_usd_close   FLOAT NOT NULL,
  xag_usd_open    FLOAT,
  xag_usd_high    FLOAT,
  xag_usd_low     FLOAT,
  
  volume          FLOAT,
  
  -- Source tracking
  source          TEXT DEFAULT 'stooq',
  source_url      TEXT,
  
  fetched_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metal_prices_date ON metal_prices(date);
```

**Verwendung**:
- Backfill historischer Daten (Dezember 2025, optional 365 Tage)
- 30-Tage-Charts ohne Live-API-Calls
- Trendanalysen über längere Zeiträume

---

## Deployment auf Vercel

### Environment Variables

**Neu erforderlich**:
```bash
# Backfill Protection (gleicher wie für Cron)
CRON_SECRET=your-random-secret-here
```

**Weiterhin erforderlich**:
```bash
# Database (Supabase)
DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://...?connection_limit=1

# API Keys
METALS_API_KEY=your-metals-api-key
TWELVE_DATA_API_KEY=your-twelve-data-key  # Optional
```

### Erste Schritte nach Deployment

1. **Backfill ausführen** (historische Daten laden):
   ```bash
   curl "https://YOUR-APP.vercel.app/api/admin/backfill?token=YOUR_CRON_SECRET&from=2025-12-01&to=2025-12-31"
   ```

2. **Ersten Refresh machen** (aktuelle Daten):
   ```bash
   curl -X POST "https://YOUR-APP.vercel.app/api/refresh"
   ```

3. **Dashboard öffnen**:
   - Sollte sofort laden (DB-First)
   - Falls Daten alt: Auf "Aktualisieren" klicken

---

## Best Practices

### 1. Regelmäßiges Backfill
- **Monatlich**: Neue historische Daten hinzufügen
- **Cron-Job**: Kann als GitHub Action eingerichtet werden
- **Zeitraum**: Rolling 365 Tage empfohlen

### 2. Refresh vs. Cron
- **Refresh (`/api/refresh`)**: Manuell vom Nutzer (Button im UI)
- **Cron (`/api/cron/fetch-data`)**: Automatisch täglich 09:00 UTC
- **Logik**: Beide nutzen gleiche Fetcher, aber Cron hat Auth

### 3. Monitoring
- **Health Check**: `/api/health-v2` (immer 200, zeigt Staleness)
- **Status**: `/api/status` (zeigt Konfiguration, API-Keys, DB-Counts)
- **Logs**: Vercel Function Logs für Fehleranalyse

### 4. Fehlerbehandlung
- **Keine Panik**: App funktioniert auch mit alten Daten
- **Toast-Hinweise**: Nutzer sieht welche Quellen down sind
- **Fallback-Chain**: Immer letzter bekannter Wert aus DB
- **Graceful Degradation**: Teil-Erfolg ist OK (3/4 Quellen)

---

## Troubleshooting

### Problem: "Keine Daten verfügbar"
**Ursache**: DB komplett leer
**Lösung**: 
1. Backfill ausführen
2. Oder Refresh klicken (holt Live-Daten)

### Problem: "Daten sind 7 Tage alt"
**Ursache**: Live-APIs sind down / Cron Job funktioniert nicht
**Lösung**:
1. Auf "Aktualisieren" klicken
2. Wenn weiterhin alt: API-Keys prüfen (`/api/status`)
3. Vercel Function Logs checken

### Problem: "COMEX Stocks unavailable"
**Ursache**: CME XLS-Datei nicht verfügbar (Wochenende/Feiertag)
**Lösung**:
- **Normal**: COMEX publiziert nur an Handelstagen
- **Fallback**: App zeigt letzten bekannten Wert aus DB
- **Automatisch**: Am nächsten Handelstag wird aktualisiert

### Problem: "SGE Price failed"
**Ursache**: FX Rate fehlt oder alle SGE-Provider down
**Lösung**:
1. FX Rate prüfen: Muss vorhanden sein
2. SGE Provider-Fallback-Chain:
   - Provider A: Metals-API (XAG/CNY)
   - Provider B: TwelveData (XAG/USD)
   - Provider C: Manual ENV (SGE_MANUAL_PRICE_CNY_G)
   - Provider D: COMEX + 3% Premium (Estimation)
3. Mindestens einer sollte funktionieren

---

## Testing

### Lokales Testen

```bash
# 1. Backfill testen (lokal mit .env)
curl "http://localhost:3000/api/admin/backfill?token=YOUR_CRON_SECRET&from=2025-12-01&to=2025-12-31"

# 2. Refresh testen
curl -X POST "http://localhost:3000/api/refresh"

# 3. Dashboard-v2 testen
curl "http://localhost:3000/api/dashboard-v2"

# 4. Health Check
curl "http://localhost:3000/api/health-v2"
```

### UI-Testing

1. **App öffnen**: Sollte sofort laden (DB-First)
2. **Refresh klicken**: Toast-Benachrichtigung erscheint
3. **Daten veraltet**: Status-Badge zeigt "⚠ N Tage alt"
4. **Keine Daten**: Empty State mit "Ersten Datenabruf durchführen"

---

## Roadmap / Nächste Schritte

### ✅ Abgeschlossen
- [x] MetalPrice Tabelle für Backfill
- [x] Stooq CSV Parser
- [x] /api/admin/backfill Endpoint
- [x] /api/refresh mit Fallback-Chains
- [x] Dashboard mit Refresh-Button
- [x] Toast-Benachrichtigungen
- [x] Status-Badges (aktuell/gestern/stale)
- [x] DB-First Loading

### 🔄 Optional / Future
- [ ] Backfill via GitHub Action (monatlich automatisch)
- [ ] Historische Charts (30/90/365 Tage) aus `metal_prices`
- [ ] Export historischer Daten als CSV
- [ ] Admin-Panel für manuelle Daten-Korrektur
- [ ] Alerting bei >3 Tage alten Daten
- [ ] Metriken: Uptime der einzelnen Provider
- [ ] Mobile App (React Native / PWA)

---

## Acceptance Criteria (✓ Erfüllt)

**A) Refresh Button im UI**
- ✅ Button "Aktualisieren" rechts oben
- ✅ Loading-State (Spinner + "Lädt...")
- ✅ Ruft `/api/refresh` auf
- ✅ Fehlerbehandlung: Toast statt alert()
- ✅ DB-Werte bleiben sichtbar bei Fehler

**B) Startlogik DB-First**
- ✅ App lädt zuerst aus DB
- ✅ UI rendert sofort
- ✅ Keine Blockaden beim Start
- ✅ Status-Badges zeigen Datenalter

**C) Backfill Historie**
- ✅ `/api/admin/backfill` mit CRON_SECRET
- ✅ Stooq CSV Parser
- ✅ Mindestens Dez 2025
- ✅ Optional 365 Tage
- ✅ Upsert mit unique(date)

**D) Observability**
- ✅ Kompakte Logs
- ✅ Keine Modals beim Start
- ✅ Toast-Benachrichtigungen
- ✅ Status transparent

**E) Definition "korrekt"**
- ✅ App lädt sofort aus DB
- ✅ Refresh Button funktional
- ✅ Backfill füllt DB
- ✅ Keine Crashes bei Fehlern
- ✅ Nur Hinweise, keine Blockaden

---

**Version**: 2.0.0 - DB-First Architecture  
**Datum**: 2. Januar 2026  
**Status**: ✅ Produktionsbereit
