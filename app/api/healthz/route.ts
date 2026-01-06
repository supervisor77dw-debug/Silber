import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/healthz
 * 
 * WAHRHEIT: Echte DB-Status, keine Cache, keine Lügen
 * 
 * Zeigt:
 * - DB connectivity
 * - Latest dates + counts (last 30d) für alle sources
 * - Last fetch run status per source
 * - Data freshness (grün/gelb/rot)
 */
export async function GET() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const health: any = {
    timestamp: now.toISOString(),
    db: { connected: false, error: null, info: null },
    sources: {},
    lastFetchRuns: {},
    overall: 'unknown',
  };

  const queryStart = Date.now();
  try {
    // Test DB connection + get connection info
    const dbInfo = await prisma.$queryRaw<any[]>`SELECT current_database() as db, current_schema() as schema, inet_server_addr() as host, version() as version`;
    health.db.connected = true;
    health.db.info = dbInfo[0];

    // Metal Prices (critical)
    const [metalCount30d, metalLatest] = await Promise.all([
      prisma.metalPrice.count({
        where: { date: { gte: thirtyDaysAgo } },
      }),
      prisma.metalPrice.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true, fetchedAt: true, source: true },
      }),
    ]);

    health.sources.metal = {
      count_last_30d: metalCount30d,
      latest_date: metalLatest?.date.toISOString().split('T')[0] || null,
      latest_fetched_at: metalLatest?.fetchedAt.toISOString() || null,
      latest_source: metalLatest?.source || null,
      status: determineStatus(metalLatest?.date || null, oneDayAgo, metalCount30d, 15),
    };

    // SGE Prices
    const [sgeCount30d, sgeLatest] = await Promise.all([
      prisma.sgePrice.count({
        where: { date: { gte: thirtyDaysAgo } },
      }),
      prisma.sgePrice.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true, fetchedAt: true },
      }),
    ]);

    health.sources.sge = {
      count_last_30d: sgeCount30d,
      latest_date: sgeLatest?.date.toISOString().split('T')[0] || null,
      latest_fetched_at: sgeLatest?.fetchedAt.toISOString() || null,
      status: determineStatus(sgeLatest?.date || null, oneDayAgo, sgeCount30d, 10),
    };

    // FX Rates
    const [fxCount30d, fxLatest] = await Promise.all([
      prisma.fxRate.count({
        where: { date: { gte: thirtyDaysAgo } },
      }),
      prisma.fxRate.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true, fetchedAt: true },
      }),
    ]);

    health.sources.fx = {
      count_last_30d: fxCount30d,
      latest_date: fxLatest?.date.toISOString().split('T')[0] || null,
      latest_fetched_at: fxLatest?.fetchedAt.toISOString() || null,
      status: determineStatus(fxLatest?.date || null, oneDayAgo, fxCount30d, 10),
    };

    // COMEX Stocks
    const [comexStockCount30d, comexStockLatest] = await Promise.all([
      prisma.comexStock.count({
        where: { date: { gte: thirtyDaysAgo } },
      }),
      prisma.comexStock.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true, fetchedAt: true },
      }),
    ]);

    health.sources.comex_stock = {
      count_last_30d: comexStockCount30d,
      latest_date: comexStockLatest?.date.toISOString().split('T')[0] || null,
      latest_fetched_at: comexStockLatest?.fetchedAt.toISOString() || null,
      status: determineStatus(comexStockLatest?.date || null, oneDayAgo, comexStockCount30d, 5),
    };

    // COMEX Prices
    const [comexPriceCount30d, comexPriceLatest] = await Promise.all([
      prisma.comexPrice.count({
        where: { marketDate: { gte: thirtyDaysAgo } },
      }),
      prisma.comexPrice.findFirst({
        orderBy: { marketDate: 'desc' },
        select: { marketDate: true, fetchedAt: true },
      }),
    ]);

    health.sources.comex_price = {
      count_last_30d: comexPriceCount30d,
      latest_date: comexPriceLatest?.marketDate.toISOString().split('T')[0] || null,
      latest_fetched_at: comexPriceLatest?.fetchedAt.toISOString() || null,
      status: determineStatus(comexPriceLatest?.marketDate || null, oneDayAgo, comexPriceCount30d, 10),
    };

    // Retail Prices
    const [retailCount30d, retailLatest] = await Promise.all([
      prisma.retailPrice.count({
        where: { date: { gte: thirtyDaysAgo } },
      }),
      prisma.retailPrice.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true, fetchedAt: true, verificationStatus: true },
      }),
    ]);

    health.sources.retail = {
      count_last_30d: retailCount30d,
      latest_date: retailLatest?.date.toISOString().split('T')[0] || null,
      latest_fetched_at: retailLatest?.fetchedAt.toISOString() || null,
      verification_status: retailLatest?.verificationStatus || null,
      status: retailCount30d > 0 ? 'ok' : 'empty', // Retail not critical
    };

    // Last Fetch Runs per source
    try {
      const sources = ['metal', 'sge', 'fx', 'comex_stock', 'comex_price', 'retail', 'backfill'];
      
      for (const source of sources) {
        const lastRun = await prisma.fetchRun.findFirst({
          where: { source },
          orderBy: { startedAt: 'desc' },
          select: {
            startedAt: true,
            finishedAt: true,
            status: true,
            inserted: true,
            updated: true,
            failed: true,
            errorMessage: true,
          },
        });

        if (lastRun) {
          health.lastFetchRuns[source] = {
            started_at: lastRun.startedAt.toISOString(),
            finished_at: lastRun.finishedAt?.toISOString() || null,
            status: lastRun.status,
            inserted: lastRun.inserted,
            updated: lastRun.updated,
            failed: lastRun.failed,
            error: lastRun.errorMessage || null,
          };
        } else {
          health.lastFetchRuns[source] = null; // Never fetched
        }
      }
    } catch (err) {
      // fetch_runs table might not exist yet
      health.lastFetchRuns = { error: 'fetch_runs table not found (migration pending)' };
    }

    // Overall status
    const criticalSources = ['metal', 'sge', 'fx'];
    const criticalStatuses = criticalSources.map(s => health.sources[s]?.status || 'unknown');
    
    if (criticalStatuses.every(s => s === 'ok')) {
      health.overall = 'ok';
    } else if (criticalStatuses.some(s => s === 'stale' || s === 'empty')) {
      health.overall = 'degraded';
    } else {
      health.overall = 'critical';
    }

    const queryMs = Date.now() - queryStart;

    // FORENSIC LOG
    console.log('[API /healthz] DB_QUERY:', {
      db: health.db.info,
      overall: health.overall,
      sources: Object.entries(health.sources).map(([name, data]: [string, any]) => ({
        name,
        status: data.status,
        count_30d: data.count_last_30d,
        latest_date: data.latest_date,
      })),
      queryMs,
      timestamp: now.toISOString(),
    });

    return NextResponse.json(health, { 
      status: health.overall === 'critical' ? 500 : 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    health.db.connected = false;
    health.db.error = error instanceof Error ? error.message : String(error);
    health.overall = 'critical';

    return NextResponse.json(health, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }
}

/**
 * Determine source status based on latest date and count
 */
function determineStatus(
  latestDate: Date | null,
  oneDayAgo: Date,
  count30d: number,
  minCount: number
): 'ok' | 'stale' | 'empty' {
  if (!latestDate || count30d === 0) {
    return 'empty'; // No data at all
  }
  
  if (latestDate < oneDayAgo || count30d < minCount) {
    return 'stale'; // Data too old or too few rows
  }
  
  return 'ok'; // Fresh and sufficient
}
