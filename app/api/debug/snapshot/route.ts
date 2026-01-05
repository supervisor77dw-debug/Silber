import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/debug/snapshot
 * 
 * Phase 1: Single Source of Truth Debug Console
 * 
 * Returns comprehensive debug information:
 * - deployment: env info + commit hash (if available)
 * - dbStats: counts + min/max date per table
 * - sourceHealth: status of each source (ok/fail + timestamp + error)
 * - lastRefresh: timestamp + wrote counts
 * - lastErrors: last 10 errors from debug_events
 */
export async function GET() {
  try {
    const now = new Date();
    
    // 1. Deployment Info
    const deployment = {
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local',
      region: process.env.VERCEL_REGION || 'local',
      timestamp: now.toISOString(),
    };

    // 2. DB Stats - counts + date ranges
    const [
      metalCount, metalFirst, metalLast,
      retailCount, retailFirst, retailLast,
      fxCount, fxFirst, fxLast,
      sgeCount, sgeFirst, sgeLast,
      comexPriceCount, comexPriceFirst, comexPriceLast,
      comexStockCount, comexStockFirst, comexStockLast,
    ] = await Promise.all([
      prisma.metalPrice.count(),
      prisma.metalPrice.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
      prisma.metalPrice.findFirst({ orderBy: { date: 'desc' }, select: { date: true, fetchedAt: true } }),
      
      prisma.retailPrice.count(),
      prisma.retailPrice.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
      prisma.retailPrice.findFirst({ orderBy: { date: 'desc' }, select: { date: true, fetchedAt: true } }),
      
      prisma.fxRate.count(),
      prisma.fxRate.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
      prisma.fxRate.findFirst({ orderBy: { date: 'desc' }, select: { date: true, fetchedAt: true } }),
      
      prisma.sgePrice.count(),
      prisma.sgePrice.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
      prisma.sgePrice.findFirst({ orderBy: { date: 'desc' }, select: { date: true, fetchedAt: true } }),
      
      prisma.comexPrice.count(),
      prisma.comexPrice.findFirst({ orderBy: { marketDate: 'asc' }, select: { marketDate: true } }),
      prisma.comexPrice.findFirst({ orderBy: { marketDate: 'desc' }, select: { marketDate: true, fetchedAt: true } }),
      
      prisma.comexStock.count(),
      prisma.comexStock.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
      prisma.comexStock.findFirst({ orderBy: { date: 'desc' }, select: { date: true, fetchedAt: true } }),
    ]);

    const dbStats = {
      metal_prices: {
        count: metalCount,
        minDate: metalFirst?.date.toISOString().split('T')[0] || null,
        maxDate: metalLast?.date.toISOString().split('T')[0] || null,
        lastFetch: metalLast?.fetchedAt.toISOString() || null,
      },
      retail_prices: {
        count: retailCount,
        minDate: retailFirst?.date.toISOString().split('T')[0] || null,
        maxDate: retailLast?.date.toISOString().split('T')[0] || null,
        lastFetch: retailLast?.fetchedAt.toISOString() || null,
      },
      fx_rates: {
        count: fxCount,
        minDate: fxFirst?.date.toISOString().split('T')[0] || null,
        maxDate: fxLast?.date.toISOString().split('T')[0] || null,
        lastFetch: fxLast?.fetchedAt.toISOString() || null,
      },
      sge_prices: {
        count: sgeCount,
        minDate: sgeFirst?.date.toISOString().split('T')[0] || null,
        maxDate: sgeLast?.date.toISOString().split('T')[0] || null,
        lastFetch: sgeLast?.fetchedAt.toISOString() || null,
      },
      comex_prices: {
        count: comexPriceCount,
        minDate: comexPriceFirst?.marketDate.toISOString().split('T')[0] || null,
        maxDate: comexPriceLast?.marketDate.toISOString().split('T')[0] || null,
        lastFetch: comexPriceLast?.fetchedAt.toISOString() || null,
      },
      comex_stocks: {
        count: comexStockCount,
        minDate: comexStockFirst?.date.toISOString().split('T')[0] || null,
        maxDate: comexStockLast?.date.toISOString().split('T')[0] || null,
        lastFetch: comexStockLast?.fetchedAt.toISOString() || null,
      },
    };

    // 3. Source Health - based on latest fetch attempts
    // For now, derive from DB - later from debug_events
    const sourceHealth = {
      metal: metalCount > 0 ? 'ok' : 'empty',
      retail: retailCount > 0 ? 'ok' : 'empty',
      fx: fxCount > 0 ? 'ok' : 'empty',
      sge: sgeCount > 0 ? 'ok' : 'empty',
      comex_price: comexPriceCount > 0 ? 'ok' : 'empty',
      comex_stock: comexStockCount > 0 ? 'ok' : 'empty',
    };

    // 4. Last Refresh - from debug_events (if exists)
    let lastRefresh = null;
    try {
      const lastRefreshEvent = await prisma.debugEvent.findFirst({
        where: { scope: 'refresh', level: 'info' },
        orderBy: { ts: 'desc' },
        select: { ts: true, message: true, meta: true },
      });
      
      if (lastRefreshEvent) {
        lastRefresh = {
          timestamp: lastRefreshEvent.ts.toISOString(),
          message: lastRefreshEvent.message,
          wrote: lastRefreshEvent.meta || {},
        };
      }
    } catch (err) {
      // Table might not exist yet
      console.warn('debug_events table not yet available');
    }

    // 5. Last Errors - last 10 from debug_events
    let lastErrors: any[] = [];
    try {
      const errorEvents = await prisma.debugEvent.findMany({
        where: { level: 'error' },
        orderBy: { ts: 'desc' },
        take: 10,
        select: { ts: true, source: true, message: true, meta: true },
      });
      
      lastErrors = errorEvents.map(e => ({
        time: e.ts.toISOString(),
        source: e.source,
        message: e.message,
        meta: e.meta,
      }));
    } catch (err) {
      // Table might not exist yet
      console.warn('debug_events table not yet available for errors');
    }

    return NextResponse.json({
      deployment,
      dbStats,
      sourceHealth,
      lastRefresh,
      lastErrors,
      timestamp: now.toISOString(),
    });

  } catch (error) {
    console.error('Debug snapshot error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
