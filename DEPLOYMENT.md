# Production Deployment Guide

## Deploy on Vercel with Supabase Postgres

### Prerequisites
- GitHub repository (private recommended)
- Vercel account
- Supabase account (or Vercel Postgres)

---

## 1. Setup Supabase Database

### Option A: Supabase (Recommended)

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Choose region (e.g., EU Central)
   - Set strong database password

2. **Get Connection Strings**
   
   Navigate to **Settings → Database → Connection String**
   
   You need TWO connection strings:
   
   **a) Transaction Pooler (for Runtime Queries)**
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
   → Use this for `DATABASE_URL`
   
   **b) Direct Connection (for Migrations)**
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```
   → Use this for `DIRECT_URL`

### Option B: Vercel Postgres

1. In Vercel Dashboard → Storage → Create Database → Postgres
2. Copy the `POSTGRES_PRISMA_URL` → use as `DATABASE_URL`
3. For Vercel Postgres, `DIRECT_URL` is not needed (same URL)

---

## 2. Configure Vercel Project

### Link Repository
```bash
vercel link
```

Or import via Vercel Dashboard → Add New Project → Import Git Repository

### Set Environment Variables

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

**Required Variables:**

```env
# Database (Supabase)
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres

# Cron Protection
CRON_SECRET=your-random-secret-key-here

# Timezone
TZ=Europe/Berlin
```

**Optional Variables (for automated data fetching):**

```env
# Manual Price Overrides (fallback when APIs fail)
COMEX_MANUAL_SPOT_USD_OZ=31.25
SGE_MANUAL_PRICE_CNY_G=7.45

# API Keys (optional)
METALS_API_KEY=your-metals-api-key
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key
```

**Important:** Set all variables for `Production`, `Preview`, and `Development` environments.

---

## 3. Run Database Migrations

### From Local Machine (Connected to Production DB)

```bash
# Set environment variables temporarily
export DATABASE_URL="postgresql://..."
export DIRECT_URL="postgresql://..."

# Run migrations
npx prisma migrate deploy

# Verify
npx prisma studio
```

### Or via Vercel CLI

```bash
vercel env pull .env.local
npx prisma migrate deploy
```

---

## 4. Deploy to Vercel

### Automatic Deployment
Push to GitHub `main` branch → Vercel auto-deploys

### Manual Deployment
```bash
vercel --prod
```

### Verify Build
Check Vercel Dashboard → Deployments → Latest Build

**Expected:**
- ✅ Build completes successfully
- ✅ Prisma Client generated (`postinstall` hook)
- ✅ No ESLint errors

---

## 5. Setup Vercel Cron Job

Cron is already configured in `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/fetch-data",
    "schedule": "0 8 * * *"
  }]
}
```

**Schedule:** Daily at 08:00 UTC (09:00 Berlin)

### Verify Cron Setup
1. Go to Vercel Dashboard → Your Project → Cron Jobs
2. Verify job appears and is active
3. Check "Last Run" status after first execution

### Manual Trigger (for testing)

```bash
curl -X POST https://your-app.vercel.app/api/cron/fetch-data \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

---

## 6. Backfill Historical Data

### Option A: Local Script (Recommended)

```bash
# Configure endpoint
export CRON_ENDPOINT="https://your-app.vercel.app/api/cron/fetch-data"
export CRON_SECRET="your-secret"

# Backfill last 30 days
npm run cron:backfill -- --days 30

# Specific date range
npm run cron:backfill -- --from 2025-01-01 --to 2025-12-31

# Dry run (test without saving)
npm run cron:backfill -- --days 7 --dry-run
```

### Option B: One-time Serverless Function

Deploy a one-time function or use Vercel CLI:

```bash
vercel env pull
node scripts/backfill-production.js
```

---

## 7. Verify Deployment

### Health Checks

1. **Dashboard Loads**
   - Visit https://your-app.vercel.app
   - Should show "No data yet" if DB is empty

2. **Database Connected**
   ```bash
   npx prisma studio
   # Should connect to production DB
   ```

3. **API Endpoints Work**
   ```bash
   # Dashboard data
   curl https://your-app.vercel.app/api/dashboard
   
   # Spreads
   curl https://your-app.vercel.app/api/spreads?days=30
   ```

4. **Cron Fetch Works**
   ```bash
   curl -X POST https://your-app.vercel.app/api/cron/fetch-data \
     -H "Authorization: Bearer YOUR_SECRET"
   ```

5. **Check Logs**
   - Vercel Dashboard → Your Project → Logs
   - Look for Prisma queries, fetch success/errors

---

## 8. Post-Deployment Tasks

### Initial Data Population
```bash
# Trigger manual fetch for today
curl -X POST https://your-app.vercel.app/api/cron/fetch-data \
  -H "Authorization: Bearer YOUR_SECRET"

# Backfill historical data (as far as sources allow)
npm run cron:backfill -- --days 90
```

### Monitoring
- Set up alerts in Vercel for failed builds/deployments
- Monitor Cron Job executions in Vercel Dashboard
- Check Supabase Dashboard for database health

### Regular Maintenance
- Review `fetch_logs` table for data quality issues
- Monitor PSI trends for anomalies
- Update environment variables if API keys change

---

## Known Limitations

### COMEX Silver Stocks Historical Data
**Limitation:** CME Group's `Silver_stocks.xls` file contains **only the current snapshot**, not historical data.

**Impact:**
- Backfill can only populate data from the day the app first runs forward
- Historical analysis requires manual data entry or alternative sources
- Charts will show limited history until sufficient days accumulate

**Workarounds:**
1. **Daily Snapshots:** App saves daily snapshots going forward (idempotent)
2. **Manual Import:** If you have historical XLS files, import via seed script
3. **Alternative Sources:** Some commercial data providers offer historical warehouse data (not free)

### SGE Shanghai Benchmark Historical Data
**Limitation:** Shanghai Gold Exchange does not provide free public API for historical benchmark prices.

**Impact:**
- Backfill relies on web scraping (Kitco fallback) which may be rate-limited
- Historical data quality depends on third-party sources

**Workarounds:**
1. **Manual Override:** Use `SGE_MANUAL_PRICE_CNY_G` for critical dates
2. **metals-api.com:** Supports historical data (limited free tier)
3. **Gradual Build:** Accumulate data prospectively from deployment date

### FX Rates (USD/CNY)
**Status:** ✅ Full historical data available via ECB and exchangerate.host

### COMEX Spot Price
**Status:** ⚠️ Yahoo Finance (SI=F) has limited free historical access
- **Workaround:** metals-api.com or manual override

---

## Troubleshooting

### Build Fails on Vercel
```bash
# Check Node version
# Should be 20.x (see .nvmrc)

# Verify Prisma generates
npm run postinstall

# Test build locally
npm run build
```

### Database Connection Errors
```bash
# Verify environment variables
echo $DATABASE_URL
echo $DIRECT_URL

# Test connection
npx prisma db pull
```

### Cron Job Not Running
- Verify `CRON_SECRET` is set in Vercel
- Check Vercel Cron Jobs dashboard for errors
- Test manual trigger with curl
- Review function logs in Vercel

### Missing Data in Dashboard
```bash
# Check if cron ran successfully
curl https://your-app.vercel.app/api/dashboard

# Manually trigger fetch
curl -X POST https://your-app.vercel.app/api/cron/fetch-data \
  -H "Authorization: Bearer YOUR_SECRET"

# Check database directly
npx prisma studio
```

---

## Local Development with Production DB

**⚠️ Warning:** Be careful when connecting locally to production database.

```bash
# Pull production env vars
vercel env pull .env.local

# Run migrations (if needed)
npx prisma migrate deploy

# Start dev server
npm run dev
```

**Best Practice:** Use separate databases for dev/staging/production.

---

## Rollback Procedure

If deployment fails:

1. **Revert Code**
   ```bash
   git revert HEAD
   git push
   ```

2. **Revert Database Migration**
   ```bash
   npx prisma migrate resolve --rolled-back <migration-name>
   ```

3. **Redeploy Previous Version**
   - Vercel Dashboard → Deployments → Previous Deployment → Promote to Production

---

## Support & Documentation

- **Vercel Docs:** https://vercel.com/docs
- **Prisma Docs:** https://www.prisma.io/docs
- **Supabase Docs:** https://supabase.com/docs
- **GitHub Repository:** https://github.com/supervisor77dw-debug/Silber

For issues, create a GitHub Issue or contact the maintainer.
