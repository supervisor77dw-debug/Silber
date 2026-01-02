import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint - always returns 200
 * Reports status of each component without throwing
 */
export async function GET() {
  const health = {
    status: 'operational',
    timestamp: new Date().toISOString(),
    database: {
      connected: false,
      error: null as string | null,
    },
    tables: {
      exists: false,
      list: [] as string[],
      counts: {} as Record<string, number>,
    },
    sources: {
      comex: { status: 'unknown' as 'ok' | 'stale' | 'unavailable' | 'unknown', lastUpdate: null as Date | null, message: '' },
      sge: { status: 'unknown' as 'ok' | 'stale' | 'unavailable' | 'unknown', lastUpdate: null as Date | null, message: '' },
      fx: { status: 'unknown' as 'ok' | 'stale' | 'unavailable' | 'unknown', lastUpdate: null as Date | null, message: '' },
      comexPrice: { status: 'unknown' as 'ok' | 'stale' | 'unavailable' | 'unknown', lastUpdate: null as Date | null, message: '' },
    },
    recommendations: [] as string[],
  };

  // Test database connection
  try {
    await prisma.$connect();
    health.database.connected = true;
  } catch (error) {
    health.database.error = error instanceof Error ? error.message : String(error);
    health.status = 'degraded';
    health.recommendations.push('⚠ Datenbank-Verbindung fehlgeschlagen - prüfe DATABASE_URL');
    
    return NextResponse.json(health, { status: 200 }); // Still 200!
  }

  // Check tables exist
  try {
    const result = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    health.tables.exists = result.length > 0;
    health.tables.list = result.map(r => r.tablename).sort();
  } catch (error) {
    health.recommendations.push('⚠ Konnte Tabellen nicht auflisten - möglicherweise noch keine Migrationen');
  }

  // Get record counts (non-blocking)
  try {
    const [comexStocks, sgePrices, fxRates, comexPrices, dailySpreads] = await Promise.allSettled([
      prisma.comexStock.count(),
      prisma.sgePrice.count(),
      prisma.fxRate.count(),
      prisma.comexPrice.count(),
      prisma.dailySpread.count(),
    ]);

    health.tables.counts = {
      comexStocks: comexStocks.status === 'fulfilled' ? comexStocks.value : 0,
      sgePrices: sgePrices.status === 'fulfilled' ? sgePrices.value : 0,
      fxRates: fxRates.status === 'fulfilled' ? fxRates.value : 0,
      comexPrices: comexPrices.status === 'fulfilled' ? comexPrices.value : 0,
      dailySpreads: dailySpreads.status === 'fulfilled' ? dailySpreads.value : 0,
    };
  } catch (error) {
    // Non-critical, continue
  }

  // Check latest data per source (non-blocking)
  try {
    const [latestComex, latestSge, latestFx, latestComexPrice] = await Promise.allSettled([
      prisma.comexStock.findFirst({ orderBy: { date: 'desc' } }),
      prisma.sgePrice.findFirst({ orderBy: { date: 'desc' } }),
      prisma.fxRate.findFirst({ orderBy: { date: 'desc' } }),
      prisma.comexPrice.findFirst({ orderBy: { marketDate: 'desc' } }),
    ]);

    const now = new Date();

    // COMEX status
    if (latestComex.status === 'fulfilled' && latestComex.value) {
      const daysDiff = Math.floor((now.getTime() - latestComex.value.date.getTime()) / (1000 * 60 * 60 * 24));
      health.sources.comex = {
        status: daysDiff === 0 ? 'ok' : daysDiff <= 3 ? 'stale' : 'unavailable',
        lastUpdate: latestComex.value.date,
        message: daysDiff === 0 ? 'Current' : `${daysDiff} days old`,
      };
    } else {
      health.sources.comex = { status: 'unavailable', lastUpdate: null, message: 'No data in database' };
    }

    // SGE status
    if (latestSge.status === 'fulfilled' && latestSge.value) {
      const daysDiff = Math.floor((now.getTime() - latestSge.value.date.getTime()) / (1000 * 60 * 60 * 24));
      health.sources.sge = {
        status: daysDiff === 0 ? 'ok' : daysDiff <= 3 ? 'stale' : 'unavailable',
        lastUpdate: latestSge.value.date,
        message: daysDiff === 0 ? 'Current' : `${daysDiff} days old`,
      };
    } else {
      health.sources.sge = { status: 'unavailable', lastUpdate: null, message: 'No data in database' };
    }

    // FX status
    if (latestFx.status === 'fulfilled' && latestFx.value) {
      const daysDiff = Math.floor((now.getTime() - latestFx.value.date.getTime()) / (1000 * 60 * 60 * 24));
      health.sources.fx = {
        status: daysDiff === 0 ? 'ok' : daysDiff <= 3 ? 'stale' : 'unavailable',
        lastUpdate: latestFx.value.date,
        message: daysDiff === 0 ? 'Current' : `${daysDiff} days old`,
      };
    } else {
      health.sources.fx = { status: 'unavailable', lastUpdate: null, message: 'No data in database' };
    }

    // COMEX Price status
    if (latestComexPrice.status === 'fulfilled' && latestComexPrice.value) {
      const daysDiff = Math.floor((now.getTime() - latestComexPrice.value.marketDate.getTime()) / (1000 * 60 * 60 * 24));
      health.sources.comexPrice = {
        status: daysDiff === 0 ? 'ok' : daysDiff <= 3 ? 'stale' : 'unavailable',
        lastUpdate: latestComexPrice.value.marketDate,
        message: daysDiff === 0 ? 'Current' : `${daysDiff} days old`,
      };
    } else {
      health.sources.comexPrice = { status: 'unavailable', lastUpdate: null, message: 'No data in database' };
    }
  } catch (error) {
    // Non-critical
  }

  // Generate recommendations
  if (health.tables.counts.dailySpreads === 0) {
    health.recommendations.push('ℹ Keine Spread-Daten vorhanden - führen Sie den ersten Datenabruf durch');
    health.status = 'empty';
  }

  if (Object.values(health.sources).every(s => s.status === 'unavailable')) {
    health.recommendations.push('⚠ Alle Datenquellen unavailable - führen Sie /api/trigger-fetch aus');
  }

  const staleCount = Object.values(health.sources).filter(s => s.status === 'stale').length;
  if (staleCount > 0) {
    health.recommendations.push(`ℹ ${staleCount} Datenquelle(n) veraltet - Cron-Job läuft täglich um 09:00 UTC`);
  }

  return NextResponse.json(health, { status: 200 });
}
