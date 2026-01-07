import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfDay, subDays } from 'date-fns';
import { jsonResponseNoCache } from '@/lib/headers';
import { checkAndTriggerAutoBackfill } from '@/lib/auto-backfill';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Dashboard API - DB-First approach
 * Always returns data from database, never throws on missing live data
 * Shows latest available data with status indicators
 * 
 * AUTO-BACKFILL: Prüft bei jedem Load ob historische Daten fehlen
 */
export async function GET() {
  try {
    // Auto-Backfill Check (async, non-blocking für response)
    checkAndTriggerAutoBackfill().catch(err => {
      console.warn('[AUTO_BACKFILL_BACKGROUND_ERROR]', err);
    });

    // Get latest spread data from DB
    const latestSpread = await prisma.dailySpread.findFirst({
      orderBy: { date: 'desc' },
    });

    if (!latestSpread) {
      // Empty state - no data yet
      return jsonResponseNoCache({
        isEmpty: true,
        message: 'Noch keine Daten vorhanden. Bitte führen Sie den ersten Datenabruf durch.',
        recommendations: [
          'Klicken Sie auf "Datenabruf durchführen"',
          'Oder warten Sie auf den täglichen Cron-Job (09:00 UTC)',
        ],
      });
    }

    // Check data freshness
    const today = startOfDay(new Date());
    const dataDate = startOfDay(latestSpread.date);
    const isToday = dataDate.getTime() === today.getTime();
    const daysDiff = Math.floor((today.getTime() - dataDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const dataStatus = isToday ? 'current' : daysDiff === 1 ? 'yesterday' : 'stale';
    
    // Get latest from other tables for status
    const [latestComexStock, latestSgePrice, latestFxRate, latestComexPrice] = await Promise.all([
      prisma.comexStock.findFirst({ orderBy: { date: 'desc' } }),
      prisma.sgePrice.findFirst({ orderBy: { date: 'desc' } }),
      prisma.fxRate.findFirst({ orderBy: { date: 'desc' } }),
      prisma.comexPrice.findFirst({ orderBy: { marketDate: 'desc' } }),
    ]);

    // Calculate trends (compare with 7 days ago)
    const weekAgo = subDays(dataDate, 7);
    const previousSpread = await prisma.dailySpread.findFirst({
      where: { date: { lte: weekAgo } },
      orderBy: { date: 'desc' },
    });

    const trends = {
      spread: previousSpread 
        ? ((latestSpread.spreadUsdPerOz - previousSpread.spreadUsdPerOz) / previousSpread.spreadUsdPerOz * 100)
        : null,
      registered: previousSpread
        ? ((latestSpread.registered - previousSpread.registered) / previousSpread.registered * 100)
        : null,
    };

    // Data quality status per source
    const sourceStatus = {
      comexStock: latestComexStock 
        ? { status: startOfDay(latestComexStock.date).getTime() === dataDate.getTime() ? 'ok' : 'stale', asOf: latestComexStock.date }
        : { status: 'unavailable' as const, asOf: null },
      sgePrice: latestSgePrice
        ? { 
            status: startOfDay(latestSgePrice.date).getTime() === dataDate.getTime() ? 'ok' : 'stale', 
            asOf: latestSgePrice.date,
            // CRITICAL: Expose SGE metadata for transparency
            provider: latestSgePrice.provider || 'Unknown',
            exchange: latestSgePrice.exchange || 'SGE',
            contract: latestSgePrice.contract || 'Ag99.99',
            currency: latestSgePrice.currency || 'CNY',
            fxSource: latestSgePrice.fxSource || 'ECB',
            fxRate: latestSgePrice.fxRateUsed || null,
            isEstimated: latestSgePrice.isEstimated || false,
          }
        : { status: 'unavailable' as const, asOf: null },
      fxRate: latestFxRate
        ? { status: startOfDay(latestFxRate.date).getTime() === dataDate.getTime() ? 'ok' : 'stale', asOf: latestFxRate.date }
        : { status: 'unavailable' as const, asOf: null },
      comexPrice: latestComexPrice
        ? { status: startOfDay(latestComexPrice.marketDate).getTime() === dataDate.getTime() ? 'ok' : 'stale', asOf: latestComexPrice.marketDate }
        : { status: 'unavailable' as const, asOf: null },
    };

    return jsonResponseNoCache({
      isEmpty: false,
      dataStatus,
      dataDate: latestSpread.date,
      daysSinceUpdate: daysDiff,
      
      currentSpread: {
        date: latestSpread.date,
        sgeUsdPerOz: latestSpread.sgeUsdPerOz,
        comexUsdPerOz: latestSpread.comexUsdPerOz,
        spreadUsdPerOz: latestSpread.spreadUsdPerOz,
        spreadPercent: latestSpread.spreadPercent,
        registered: latestSpread.registered,
        eligible: latestSpread.eligible,
        total: latestSpread.total,
        registeredPercent: latestSpread.registeredPercent || 0,
        psi: latestSpread.psi,
        psiStressLevel: latestSpread.psiStressLevel,
        isExtreme: latestSpread.isExtreme,
      },
      
      currentStock: latestComexStock ? {
        totalRegistered: latestComexStock.totalRegistered,
        totalEligible: latestComexStock.totalEligible,
        totalCombined: latestComexStock.totalCombined,
        registeredPercent: latestComexStock.registeredPercent || 0,
      } : null,
      
      lastFetch: {
        fetchedAt: latestSpread.createdAt,
        dataDate: latestSpread.date,
      },
      
      trends,
      sourceStatus,
    });

  } catch (error) {
    console.error('Dashboard API error:', error);
    
    // Even on error, try to return something useful
    return jsonResponseNoCache({
      isEmpty: true,
      error: 'Database query failed',
      message: error instanceof Error ? error.message : String(error),
      recommendations: [
        'Prüfen Sie die Datenbankverbindung (DATABASE_URL)',
        'Stellen Sie sicher, dass Migrationen ausgeführt wurden',
        'Siehe /api/health für Details',
      ],
    }, 200); // Still 200, not 500
  }
}
