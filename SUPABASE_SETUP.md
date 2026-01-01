# Supabase Database URLs richtig konfigurieren

## Problem: "Tenant or user not found"

Dieser Fehler bedeutet, dass die DATABASE_URL falsch ist.

## ✅ Korrekte Supabase URLs finden

### 1. Öffnen Sie Ihr Supabase Projekt

Gehen Sie zu: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/database

### 2. Connection Pooling (für DATABASE_URL)

**Vercel braucht: Transaction Mode**

```
Settings → Database → Connection Pooling → Connection string

⚠️ WICHTIG: Mode = "Transaction" wählen!
```

**Beispiel DATABASE_URL (Transaction Pooler, Port 6543):**
```
postgresql://postgres.abcdefghijklmn:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

**In Vercel Environment Variables:**
```
DATABASE_URL=postgresql://postgres.abcdefghijklmn:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

### 3. Direct Connection (für DIRECT_URL)

**Für Prisma Migrations (Port 5432):**

```
Settings → Database → Connection string → Direct connection (NOT pooled)
```

**Beispiel DIRECT_URL:**
```
postgresql://postgres.abcdefghijklmn:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

**In Vercel Environment Variables:**
```
DIRECT_URL=postgresql://postgres.abcdefghijklmn:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

## ⚠️ Häufige Fehler

### ❌ FALSCH: Session Mode statt Transaction Mode
```
# Vercel funktioniert NICHT mit Session Mode:
postgresql://...pooler.supabase.com:5432/postgres  (Session Mode)
```

### ✅ RICHTIG: Transaction Mode für DATABASE_URL
```
postgresql://...pooler.supabase.com:6543/postgres  (Transaction Mode)
```

### ❌ FALSCH: Beide URLs sind gleich
```
DATABASE_URL=postgresql://...com:6543/postgres
DIRECT_URL=postgresql://...com:6543/postgres     ← FALSCH! Muss Port 5432 sein
```

### ✅ RICHTIG: Unterschiedliche Ports
```
DATABASE_URL=postgresql://...com:6543/postgres   ← Transaction Pooler
DIRECT_URL=postgresql://...com:5432/postgres     ← Direct Connection
```

## 🔍 Wie erkenne ich die richtigen URLs?

| Variable | Host-Endung | Port | Zweck |
|----------|------------|------|-------|
| `DATABASE_URL` | `.pooler.supabase.com` | **6543** | Transaction Mode für Runtime |
| `DIRECT_URL` | `.pooler.supabase.com` | **5432** | Direct für Migrations |

## 📝 Vercel konfigurieren

1. **Gehen Sie zu Vercel:**
   ```
   https://vercel.com/YOUR-USERNAME/silber/settings/environment-variables
   ```

2. **Löschen Sie alte Variablen** (falls vorhanden)

3. **Fügen Sie neu hinzu:**
   ```
   Name: DATABASE_URL
   Value: postgresql://postgres.[ref]:[password]@....pooler.supabase.com:6543/postgres
   Environment: Production, Preview, Development
   ```

   ```
   Name: DIRECT_URL
   Value: postgresql://postgres.[ref]:[password]@....pooler.supabase.com:5432/postgres
   Environment: Production, Preview, Development
   ```

   ```
   Name: CRON_SECRET
   Value: <generieren Sie einen zufälligen String, z.B. mit openssl rand -hex 32>
   Environment: Production, Preview, Development
   ```

   ```
   Name: TZ
   Value: Europe/Berlin
   Environment: Production, Preview, Development
   ```

4. **Redeploy auslösen:**
   - Gehen Sie zu "Deployments" Tab
   - Klicken Sie auf das neueste Deployment
   - Klicken Sie "Redeploy"

## 🗄️ Datenbank Migrations ausführen

**Nachdem URLs korrekt sind:**

```bash
# Lokal ausführen (mit korrekten URLs):
export DATABASE_URL="postgresql://postgres.[ref]:[password]@...com:6543/postgres"
export DIRECT_URL="postgresql://postgres.[ref]:[password]@...com:5432/postgres"

npx prisma migrate deploy
```

Oder über Vercel CLI:

```bash
vercel env pull .env.local
npx prisma migrate deploy
```

## ✅ Testen

Nach erfolgreicher Konfiguration sollte https://silber-ten.vercel.app/ funktionieren.

Falls immer noch Fehler:
- Vercel Logs prüfen: `vercel logs`
- Oder in Dashboard: https://vercel.com/YOUR-USERNAME/silber/logs
